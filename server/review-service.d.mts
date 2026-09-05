import type {NetworkState,Scenario} from '../lib/network-policy';
import type {IncomingMessage,ServerResponse} from 'node:http';
export function createReviewStore(path:string):{snapshot():unknown;save(state:NetworkState,revision:number):unknown;test(scenario:Scenario,revision:number):unknown;acknowledge():unknown;restore(revision:number):unknown;close():void};
export function createReviewMiddleware(store:ReturnType<typeof createReviewStore>,options?:{authorize?:(req:IncomingMessage)=>boolean}):(req:IncomingMessage,res:ServerResponse,next?:()=>void)=>Promise<void>;
