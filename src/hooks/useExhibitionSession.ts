import {useCallback,useEffect,useState} from 'react';
import {getSharedExhibitionConfig,type SharedExhibitionConfig} from '@/lib/api/exhibitions';

export function useExhibitionSession(enabled=true) {
 const [config,setConfig]=useState<SharedExhibitionConfig>();
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(enabled);
 const refresh=useCallback(async()=>{
  try{const next=await getSharedExhibitionConfig();setConfig(next);setError('');return next;}
  catch{setError('The shared exhibition default could not be refreshed. Check the exhibition before submitting.');return undefined;}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  if(!enabled)return;
  let disposed=false,running=false;
  const load=async()=>{
   if(running)return;running=true;
   try{const next=await getSharedExhibitionConfig();if(!disposed){setConfig(next);setError('');}}
   catch{if(!disposed)setError('The shared exhibition default could not be refreshed. Check the exhibition before submitting.');}
   finally{running=false;if(!disposed)setLoading(false);}
  };
  void load();const timer=window.setInterval(()=>void load(),10000);
  const focus=()=>void load();window.addEventListener('focus',focus);window.addEventListener('lead71-exhibition-session-updated',focus);
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('lead71-exhibition-session-updated',focus);};
 },[enabled]);
 return {config,error,loading,refresh};
}
