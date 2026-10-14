'use strict';
// A time-trial course: braking gates, gaps, landings, limited recoveries.
module.exports = function createRacer(Matter) {
  const {Engine,Bodies,Body,Composite,Constraint,Query}=Matter;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const profile=[[0,430],[500,430],[800,300],[1100,430],[1450,430],[1750,285],[2110,390],[2400,390],[2750,235],[3100,280],[3300,430],[3700,430],[4050,300],[4450,380],[4850,260],[5150,420],[5600,420],[5900,290],[6300,420],[7000,420]];
  const gaps=[[1840,1990],[4200,4310],[5980,6100]];
  const gates=[{x:1300,speed:3.1},{x:3500,speed:3.1},{x:5400,speed:3.1}];
  function yAt(x) {
    if(x<=0)return 430;
    const i=profile.findIndex(p=>p[0]>=x);
    if(i<0)return 420;
    const a=profile[Math.max(0,i-1)],b=profile[i],t=clamp((x-a[0])/(b[0]-a[0]||1),0,1);
    return a[1]+(b[1]-a[1])*(.5-.5*Math.cos(t*Math.PI));
  }
  function car(world,x) {
    const y=yAt(x)-70,filter={group:Body.nextGroup(true),category:2,mask:1};
    const body=Bodies.rectangle(x,y,70,23,{density:.002,friction:.8,frictionAir:.01,collisionFilter:{...filter},chamfer:{radius:5}});
    const wheels=[-26,26].map(dx=>Bodies.circle(x+dx,y+30,16,{density:.0015,friction:1.5,frictionStatic:2,frictionAir:.005,collisionFilter:{...filter}}));
    const springs=wheels.flatMap((wheel,i)=>{
      const dx=i?-26:26;
      // Correct sign follows the actual wheel, not the list's direction.
      const anchor=i?26:-26;
      return [Constraint.create({bodyA:body,pointA:{x:anchor,y:0},bodyB:wheel,length:30,stiffness:.35,damping:.12}),
        Constraint.create({bodyA:body,pointA:{x:anchor*.25,y:0},bodyB:wheel,length:Math.hypot(dx*.75,30),stiffness:.2,damping:.08})];
    });
    const parts=[body,...wheels,...springs];Composite.add(world,parts);return {body,wheels,parts};
  }
  function rescue(g,p,now,reason) {
    if(p.out||now-p.resetAt<1400)return false;
    Composite.remove(g.engine.world,p.parts);p.resets++;p.resetAt=now;p.upside=0;p.reason=reason;
    Object.assign(p,car(g.engine.world,p.checkpoint));
    if(p.resets>=6){p.out=true;[p.body,...p.wheels].forEach(b=>Body.setStatic(b,true));}
    return true;
  }
  return {
    title:'Hill Climb: Trials',icon:'01',seconds:100,category:'Skill',difficulty:'Experte',
    description:'Bremszonen, echte Sprünge und sechs Versuche. Vollgas allein bringt dich nicht durchs Ziel.',
    controls:'W / ↑ Gas · S / ↓ bremsen · A D / ← → in der Luft ausbalancieren · R bergen · Vor gelben Toren unter 19 km/h · Gas loslassen kühlt den Motor',
    init(ids){
      const engine=Engine.create({positionIterations:8,constraintIterations:6}),terrain=[];
      for(let x=-240;x<=7000;x+=20)terrain.push([x,yAt(x)]);
      const ground=terrain.slice(1).flatMap((b,i)=>{
        const a=terrain[i],middle=(a[0]+b[0])/2;
        if(gaps.some(([l,r])=>middle>l&&middle<r))return [];
        const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
        return [Bodies.rectangle(middle-Math.sin(angle)*100,(a[1]+b[1])/2+Math.cos(angle)*100,Math.hypot(b[0]-a[0],b[1]-a[1])+1,200,{isStatic:true,angle,friction:1.2,collisionFilter:{category:1,mask:2}})];
      });
      Composite.add(engine.world,ground);
      return {engine,ground,terrain,gaps,gates,finish:6500,solo:ids.length===1,
        players:Object.fromEntries(ids.map(id=>[id,{...car(engine.world,100),maxX:100,checkpoint:100,nextGate:0,resetAt:-5000,resets:0,upside:0,out:false,heat:0,reason:'',finished:false}]))};
    },
    meta:g=>({terrain:g.terrain,gaps:g.gaps,gates:g.gates,finish:g.finish}),
    input(g,id,input,now){return input.action==='reset'&&rescue(g,g.players[id],now,'Geborgen');},
    tick(g,dt,now,r){
      for(const [id,p] of Object.entries(g.players)){
        if(p.out||!r.connected.has(id))continue;
        const c=r.controls[id],onGround=p.wheels.some(w=>Query.collides(w,g.ground).length);
        p.heat=clamp(p.heat+(c.throttle>0?14*c.throttle:-27)*dt,0,100);
        const power=p.heat>=95?.15:1;
        for(const w of p.wheels){
          if(c.throttle)Body.setAngularVelocity(w,w.angularVelocity+clamp(c.throttle*.43*power-w.angularVelocity,-.1,.065));
        }
        if(onGround&&c.throttle){
          const slope=(yAt(p.body.position.x+5)-yAt(p.body.position.x-5))/10;
          const force=p.body.mass*(c.throttle<0?.00075:.00032)*c.throttle*power;
          Body.applyForce(p.body,p.body.position,{x:force,y:slope*force});
        }
        p.body.torque+=c.tilt*p.body.inertia*.0000035;
      }
      Engine.update(g.engine,dt*1000);
      for(const [id,p] of Object.entries(g.players)){
        if(p.out||!r.connected.has(id))continue;
        const x=p.body.position.x,gate=g.gates[p.nextGate];
        if(gate&&x>=gate.x){
          if(Math.abs(p.body.velocity.x)>gate.speed||Math.cos(p.body.angle)<.75){rescue(g,p,now,'Zu schnell am Bremstor!');continue;}
          p.nextGate++;p.checkpoint=gate.x+65;p.reason='Checkpoint!';
        }
        p.maxX=Math.max(p.maxX,clamp(x,100,gate?gate.x:g.finish));
        p.upside=Math.cos(p.body.angle)<-.15?p.upside+dt:0;
        if(p.upside>.65||p.body.position.y>650||x<0){rescue(g,p,now,'Landung verpasst');continue;}
        if(x>=g.finish&&p.nextGate===g.gates.length)p.finished=true;
      }
      return Object.values(g.players).some(p=>p.finished)||Object.entries(g.players).every(([id,p])=>p.out||!r.connected.has(id));
    },
    view:g=>({players:Object.fromEntries(Object.entries(g.players).map(([id,p])=>[id,{
      x:p.body.position.x,y:p.body.position.y,angle:p.body.angle,wheels:p.wheels.map(w=>({x:w.position.x,y:w.position.y,angle:w.angle})),
      distance:Math.round((p.maxX-100)/10),speed:Math.round(Math.abs(p.body.velocity.x)*6),heat:Math.round(p.heat),nextGate:p.nextGate,
      resets:p.resets,out:p.out,reason:p.reason,finished:p.finished
    }]))}),
    score:(g,id)=>g.players[id].finished?100000:Math.max(0,Math.floor(g.players[id].maxX-100)-g.players[id].resets*120),
    detail:(g,id)=>`${Math.round((g.players[id].maxX-100)/10)} m · ${g.players[id].nextGate}/3 Tore · ${g.players[id].resets}/6 Bergungen${g.players[id].finished?' · ZIEL':''}`,
    dispose(g){Composite.clear(g.engine.world,false);Engine.clear(g.engine);}
  };
};
