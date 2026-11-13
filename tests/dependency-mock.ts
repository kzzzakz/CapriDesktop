export const toolCalls: unknown[] = []
export const ToolExecutor = {
  execute: async (...args: unknown[]) => {
    toolCalls.push(args)
    return { success: true, output: 'ok' }
  },
}
let testGaming=false
const gamingListeners=new Set<(enabled:boolean)=>void>()
export function setTestGamingMode(enabled:boolean) {
  testGaming=enabled
  for(const listener of gamingListeners) listener(enabled)
}
export const windowManager = {
  setGamingMode: () => toolCalls.push('game-mode'),
  isGamingModeActive:()=>testGaming,
  onGamingModeChanged:(listener:(enabled:boolean)=>void)=>{gamingListeners.add(listener);return ()=>gamingListeners.delete(listener)}
}
export const llmFetch = async () => {
  throw new Error('No model installed (test)')
}
export const llmBody = (value: unknown) => value

export const personalize = (text: string) => text

export const screenCalls={captures:0,uploads:0,speech:[] as string[],prompts:[] as string[],defer:false,fail:false,resolve:null as ((text:string)=>void)|null,signal:undefined as AbortSignal|undefined}
export const isCloudMode=()=>true
export const describeCloudImage=async(_image:string,prompt:string,signal?:AbortSignal)=>{screenCalls.uploads++;screenCalls.prompts.push(prompt);screenCalls.signal=signal;if(screenCalls.fail)throw new Error('Provider failed (test)');if(screenCalls.defer)return new Promise<string>(resolve=>{screenCalls.resolve=resolve});return 'Test screen comment'}
export const scannerService={getStatus:()=>({isScanning:false}),captureRegionBase64:async()=>{screenCalls.captures++;return {base64:'synthetic-test-image'}}}
export const activity={running:false,script:false,pose:'standing'}
export const scriptPlayer={isPlaying:()=>activity.script}
export const agentManager={getStatus:()=>({isRunning:activity.running}),getCompanionState:()=> activity.pose,setCompanionSpeech:(text:string)=>screenCalls.speech.push(text)}
