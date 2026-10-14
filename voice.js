'use strict';
const fs=require('node:fs');
const path=require('node:path');
const RATE=8000,MAX_SAMPLES=RATE*6;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]||0;};
function readPCM(value){
  if(!Buffer.isBuffer(value)&&!(value instanceof Uint8Array))throw Error('Keine gültige Audiospur.');
  const pcm=Buffer.from(value);
  if(pcm.length%2||pcm.length<3200||pcm.length>MAX_SAMPLES*2)throw Error('Der Clip muss zwischen 0,2 und 6 Sekunden lang sein.');
  return pcm;
}
function features(pcm){
  const samples=new Float64Array(pcm.length/2);
  let sum=0;
  for(let i=0;i<samples.length;i++){samples[i]=pcm.readInt16LE(i*2)/32768;sum+=samples[i];}
  const mean=sum/samples.length;for(let i=0;i<samples.length;i++)samples[i]-=mean;
  const frames=[];let maximum=0;
  for(let at=0;at+256<samples.length;at+=160){
    let energy=0;for(let j=0;j<256;j++)energy+=samples[at+j]**2;
    energy=Math.sqrt(energy/256);maximum=Math.max(maximum,energy);
    let best=0,bestLag=0;
    if(energy>.008){
      for(let lag=20;lag<=100;lag++){
        let dot=0,a=0,b=0;
        for(let j=0;j<256-lag;j++){const x=samples[at+j],y=samples[at+j+lag];dot+=x*y;a+=x*x;b+=y*y;}
        const corr=dot/Math.sqrt(a*b+1e-12);
        if(corr>best){best=corr;bestLag=lag;}
      }
    }
    frames.push({energy,pitch:best>.5?12*Math.log2(RATE/bestLag):null});
  }
  if(maximum<.008)throw Error('Die Aufnahme ist zu leise. Mikrofon prüfen und lauter sprechen.');
  let first=frames.findIndex(f=>f.energy>maximum*.1),last=frames.length-1;
  while(last>first&&frames[last].energy<maximum*.1)last--;
  const trimmed=frames.slice(Math.max(0,first-1),last+2),pitches=trimmed.filter(f=>f.pitch!==null).map(f=>f.pitch);
  if(pitches.length<3)throw Error('Keine klare Stimme erkannt. Bitte ohne Musik und näher am Mikrofon aufnehmen.');
  const center=median(pitches);
  return {duration:trimmed.length*.02,frames:trimmed.map(f=>[Math.sqrt(f.energy/maximum),f.pitch===null?0:clamp((f.pitch-center)/12,-2,2),f.pitch===null?0:1])};
}
function similarity(a,b){
  // Banded dynamic-time-warping of loudness, relative pitch, and voiced timing.
  // This measures delivery, not the spoken words or speaker identity.
  const n=a.frames.length,m=b.frames.length,band=Math.max(12,Math.ceil(Math.max(n,m)*.25));
  let previous=new Float64Array(m+1).fill(Infinity);previous[0]=0;
  for(let i=1;i<=n;i++){
    const current=new Float64Array(m+1).fill(Infinity);
    for(let j=Math.max(1,Math.floor(i*m/n)-band);j<=Math.min(m,Math.ceil(i*m/n)+band);j++){
      const x=a.frames[i-1],y=b.frames[j-1];
      const cost=Math.abs(x[0]-y[0])*.55+Math.min(1,Math.abs(x[1]-y[1]))*.3+Math.abs(x[2]-y[2])*.15;
      current[j]=cost+Math.min(previous[j],previous[j-1],current[j-1]);
    }
    previous=current;
  }
  const delivery=Math.exp(-6*previous[m]/Math.max(n,m));
  const duration=Math.exp(-2*Math.abs(Math.log(a.duration/b.duration)));
  const score=Math.round(1000*delivery*(.7+.3*duration));
  return {score:clamp(score,0,1000),delivery:Math.round(delivery*100),timing:Math.round(duration*100)};
}
function prepareClip(value,name='Eigene Vorlage'){
  const pcm=readPCM(value),analysis=features(pcm);
  const title=typeof name==='string'?name.replace(/[\x00-\x1f]/g,'').trim().slice(0,55):'Eigene Vorlage';
  return {name:title||'Eigene Vorlage',pcm,analysis,duration:pcm.length/2/RATE};
}
function wavPCM(file){
  const b=fs.readFileSync(file);let at=12;
  while(at+8<=b.length){const size=b.readUInt32LE(at+4);if(b.toString('ascii',at,at+4)==='data')return b.subarray(at+8,at+8+size);at+=8+size+(size%2);}
  throw Error('WAV ohne Audiodaten');
}
let defaultClip=null;
try{defaultClip=prepareClip(wavPCM(path.join(__dirname,'public/audio/starter.wav')),'Demo: Noch eine Runde?');}catch{/* Host can upload or record a reference. */}
const dub={
  title:'Meme Dub Studio',icon:'08',seconds:110,category:'Party',difficulty:'Mittel',
  description:'Vorlage hören, selbst nachsprechen, gemeinsam abspielen. Rhythmus und Betonung bringen Punkte.',
  controls:'Kopfhörer empfohlen · Vorlage hören · Mikrofon starten · Aufnahme abschicken · HTTPS erforderlich',
  init(ids,startsAt,options={}){
    const clip=options.clip||defaultClip;
    if(!clip)throw Error('Keine Dub-Vorlage');
    return {clip,phase:'listen',recordAt:startsAt+8000,recordUntil:startsAt+33000,playlist:[],playbackEnd:0,
      players:Object.fromEntries(ids.map(id=>[id,{pcm:null,score:0,delivery:0,timing:0}]))};
  },
  meta:g=>({name:g.clip.name,duration:g.clip.duration}),
  input(g,id,input,now){
    if(input.action!=='record'||g.phase!=='record'||now>=g.recordUntil||g.players[id].pcm)return false;
    try{const pcm=readPCM(input.pcm),analysis=features(pcm),match=similarity(g.clip.analysis,analysis);Object.assign(g.players[id],{pcm,...match});return true;}
    catch(e){return {error:e.message};}
  },
  tick(g,dt,now,r){
    if(g.phase==='listen'&&now>=g.recordAt)g.phase='record';
    if(g.phase==='record'&&(now>=g.recordUntil||[...r.connected].every(id=>g.players[id].pcm))){
      g.phase='playback';let at=now+900;
      for(const [id,p]of Object.entries(g.players))if(p.pcm){const duration=p.pcm.length/2/RATE;g.playlist.push({id,at,duration});at+=(duration+.9)*1000;}
      g.playbackEnd=at+1600;
    }
    return g.phase==='playback'&&now>=g.playbackEnd;
  },
  view:(g,now)=>({phase:g.phase,recordAt:g.recordAt,recordUntil:g.recordUntil,playlist:g.playlist,
    players:Object.fromEntries(Object.entries(g.players).map(([id,p])=>[id,{submitted:!!p.pcm,score:g.phase==='playback'?p.score:null,delivery:p.delivery,timing:p.timing}]))}),
  score:(g,id)=>g.players[id].score,
  detail:(g,id)=>g.players[id].pcm?`${(g.players[id].score/10).toFixed(1)} % Soundmatch · Betonung ${g.players[id].delivery} % · Timing ${g.players[id].timing} %`:'Keine Aufnahme abgegeben'
};
module.exports={dub,prepareClip,features,similarity,defaultClip,RATE};
