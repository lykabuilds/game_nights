/* Firebase adapter: anonymous sign-in + Firestore, exposed through window.backend. */
if(!window.__mockBackend){
  const V='10.12.2',G='https://www.gstatic.com/firebasejs/'+V+'/';
  try{
    const {firebaseConfig}=await import('../firebase-config.js');
    if(!firebaseConfig||!firebaseConfig.apiKey||/PASTE/.test(firebaseConfig.apiKey)){window.backendError='config';window.backend._resolve(null);}
    else{
      const [{initializeApp},{getAuth,signInAnonymously,onAuthStateChanged},fs]=await Promise.all([import(G+'firebase-app.js'),import(G+'firebase-auth.js'),import(G+'firebase-firestore.js')]);
      const app=initializeApp(firebaseConfig);const auth=getAuth(app);
      const u=await new Promise((ok,bad)=>{const un=onAuthStateChanged(auth,x=>{if(x){un();ok(x)}});signInAnonymously(auth).catch(bad)});
      const store=fs.getFirestore(app);
      const errOf=e=>({code:e&&e.code==='permission-denied'?'denied':e&&e.code==='resource-exhausted'?'quota_exceeded':'unavailable',message:e&&e.message});
      const rethrow=e=>{throw errOf(e)};
      const flat=(o,pre='',out={})=>{for(const k in o){const v=o[k],key=pre?pre+'.'+k:k;if(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length)flat(v,key,out);else out[key]=v}return out};
      const wrap=s=>({id:s.id,exists:s.exists(),data:()=>s.data(),metadata:s.metadata});
      const meta={includeMetadataChanges:true};
      function docRef(path){const r=fs.doc(store,path);return{id:r.id,path,
        get:()=>fs.getDoc(r).then(wrap,rethrow),set:d=>fs.setDoc(r,d).catch(rethrow),update:d=>fs.updateDoc(r,flat(d)).catch(rethrow),delete:()=>fs.deleteDoc(r).catch(rethrow),
        onSnapshot:(n,e)=>fs.onSnapshot(r,meta,s=>n(wrap(s)),x=>e&&e(errOf(x))),collection:c=>colRef(path+'/'+c)}}
      function colRef(path,cons=[]){const q=()=>cons.length?fs.query(fs.collection(store,path),...cons):fs.collection(store,path);
        const qs=s=>({docs:s.docs.map(wrap),size:s.size,empty:s.empty,docChanges:()=>[],metadata:s.metadata});
        return{path,where:(f,o,v)=>colRef(path,[...cons,fs.where(f,o,v)]),orderBy:(f,d)=>colRef(path,[...cons,fs.orderBy(f,d||'asc')]),limit:n=>colRef(path,[...cons,fs.limit(n)]),
          get:()=>fs.getDocs(q()).then(qs,rethrow),onSnapshot:(n,e)=>fs.onSnapshot(q(),meta,s=>n(qs(s)),x=>e&&e(errOf(x))),
          doc:id=>docRef(id?path+'/'+id:fs.doc(fs.collection(store,path)).path),
          add:async d=>{const r=docRef(fs.doc(fs.collection(store,path)).path);await r.set(d);return r}}}
      window.backend._resolve({db:{doc:docRef,collection:p=>colRef(p)},user:{id:async()=>u.uid,can:async()=>true,isOwner:()=>false}});
    }
  }catch(e){console.error(e);window.backendError='connect';window.backend._resolve(null);}
}
