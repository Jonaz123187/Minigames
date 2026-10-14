class GiGRecorder extends AudioWorkletProcessor {
  constructor(){super();this.buffer=new Float32Array(2048);this.used=0;}
  process(inputs){
    const channel=inputs[0]?.[0];if(channel){for(let i=0;i<channel.length;i++){this.buffer[this.used++]=channel[i];if(this.used===2048){this.port.postMessage(this.buffer.buffer,[this.buffer.buffer]);this.buffer=new Float32Array(2048);this.used=0;}}}
    return true;
  }
}
registerProcessor('gig-recorder',GiGRecorder);
