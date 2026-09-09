(() => {
"use strict";
const $ = s => document.querySelector(s);
const canvas = $("#canvas"), ctx = canvas.getContext("2d", {willReadFrequently:true});
const fileInput=$("#fileInput"), solveBtn=$("#solveBtn"), saveBtn=$("#saveBtn");
const sizeSelect=$("#sizeSelect"), statusEl=$("#status"), answerEl=$("#answer");
const leftRange=$("#leftRange"), topRange=$("#topRange"), widthRange=$("#widthRange");
const leftVal=$("#leftVal"), topVal=$("#topVal"), widthVal=$("#widthVal");
let sourceImage=null, solution=null, boardRect=null;

function setStatus(msg, cls="muted"){ statusEl.textContent=msg; statusEl.className="status "+cls; }
function updateVals(){leftVal.textContent=leftRange.value+"%";topVal.textContent=topRange.value+"%";widthVal.textContent=widthRange.value+"%"; if(sourceImage) drawSource();}
[leftRange,topRange,widthRange].forEach(x=>x.addEventListener("input",updateVals));

function loadImageFromBlob(blob){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob), img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=e=>{URL.revokeObjectURL(url);reject(e)};
    img.src=url;
  });
}
async function useImage(img){
  sourceImage=img; solution=null; answerEl.textContent="";
  const maxW=1200, scale=Math.min(1,maxW/img.naturalWidth);
  canvas.width=Math.round(img.naturalWidth*scale); canvas.height=Math.round(img.naturalHeight*scale);
  drawSource(); solveBtn.disabled=false; saveBtn.disabled=true;
  setStatus("圖片已載入。按「自動解題」。");
}
fileInput.addEventListener("change", async e=>{
  const f=e.target.files?.[0]; if(!f)return;
  try{ await useImage(await loadImageFromBlob(f)); }catch{setStatus("無法讀取圖片。","err")}
});

function currentRect(){
  const x=canvas.width*(+leftRange.value/100), y=canvas.height*(+topRange.value/100), w=canvas.width*(+widthRange.value/100);
  const maxSide=Math.min(w,canvas.width-x,canvas.height-y);
  return {x,y,w:maxSide,h:maxSide};
}
function drawSource(){
  if(!sourceImage)return;
  ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(sourceImage,0,0,canvas.width,canvas.height);
  boardRect=currentRect();
  ctx.save(); ctx.strokeStyle="rgba(17,24,39,.75)"; ctx.lineWidth=Math.max(2,canvas.width/300); ctx.setLineDash([10,8]);
  ctx.strokeRect(boardRect.x,boardRect.y,boardRect.w,boardRect.h); ctx.restore();
  if(solution) drawSolution(solution.n,solution.cols,boardRect);
}
function drawSolution(n, cols, rect){
  const cw=rect.w/n,ch=rect.h/n;
  ctx.save(); ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.font=`${Math.floor(cw*.52)}px -apple-system,Apple Color Emoji,sans-serif`;
  ctx.lineWidth=Math.max(3,cw*.055);
  for(let r=0;r<n;r++){
    const c=cols[r], x=rect.x+(c+.5)*cw, y=rect.y+(r+.5)*ch;
    ctx.beginPath(); ctx.arc(x,y,Math.min(cw,ch)*.34,0,Math.PI*2);
    ctx.strokeStyle="#dc2626"; ctx.stroke();
    ctx.fillText("🐱",x,y+1);
  }
  ctx.restore();
}

function rgbAt(x,y){
  const d=ctx.getImageData(Math.max(0,Math.min(canvas.width-1,Math.round(x))),Math.max(0,Math.min(canvas.height-1,Math.round(y))),1,1).data;
  return [d[0]/255,d[1]/255,d[2]/255];
}
function dist2(a,b){const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2];return dr*dr+dg*dg+db*db}
function median(a){const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]}
function sat(c){const M=Math.max(...c),m=Math.min(...c);return M===0?0:(M-m)/M}
function sampleCell(rect,n,r,c){
  const cw=rect.w/n,ch=rect.h/n;
  const pts=[[.30,.30],[.70,.30],[.30,.70],[.70,.70],[.5,.28],[.28,.5],[.72,.5],[.5,.72]];
  let colors=[];
  for(const [ox,oy] of pts){
    const q=rgbAt(rect.x+(c+ox)*cw,rect.y+(r+oy)*ch);
    if(sat(q)>.08 && Math.max(...q)>.20) colors.push(q);
  }
  if(!colors.length) colors=[rgbAt(rect.x+(c+.5)*cw,rect.y+(r+.5)*ch)];
  return [median(colors.map(x=>x[0])),median(colors.map(x=>x[1])),median(colors.map(x=>x[2]))];
}
function kmeans(colors,k){
  if(colors.length<k)return null;
  let centers=[colors[0]];
  while(centers.length<k){
    let best=colors[0],bestD=-1;
    for(const c of colors){let md=Math.min(...centers.map(x=>dist2(c,x))); if(md>bestD){bestD=md;best=c}}
    centers.push([...best]);
  }
  let asg=new Array(colors.length).fill(0);
  for(let iter=0;iter<30;iter++){
    let changed=false;
    for(let i=0;i<colors.length;i++){
      let bi=0,bd=Infinity;
      for(let j=0;j<k;j++){const d=dist2(colors[i],centers[j]);if(d<bd){bd=d;bi=j}}
      if(asg[i]!==bi){asg[i]=bi;changed=true}
    }
    let sums=Array.from({length:k},()=>[0,0,0,0]);
    for(let i=0;i<colors.length;i++){const s=sums[asg[i]],c=colors[i];s[0]+=c[0];s[1]+=c[1];s[2]+=c[2];s[3]++}
    for(let j=0;j<k;j++)if(sums[j][3])centers[j]=[sums[j][0]/sums[j][3],sums[j][1]/sums[j][3],sums[j][2]/sums[j][3]];
    if(!changed)break;
  }
  return asg;
}
function buildMap(rect,n){
  const colors=[]; for(let r=0;r<n;r++)for(let c=0;c<n;c++)colors.push(sampleCell(rect,n,r,c));
  const a=kmeans(colors,n); if(!a)return null;
  return Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>a[r*n+c]));
}
function connected(region,map){
  const n=map.length, cells=[]; for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(map[r][c]===region)cells.push([r,c]);
  if(!cells.length)return false;
  const seen=new Set([cells[0].join(",")]),q=[cells[0]];
  for(let i=0;i<q.length;i++){const [r,c]=q[i];for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const nr=r+dr,nc=c+dc,k=nr+","+nc;if(nr>=0&&nc>=0&&nr<n&&nc<n&&map[nr][nc]===region&&!seen.has(k)){seen.add(k);q.push([nr,nc])}}}
  return seen.size===cells.length;
}
function solveMap(map, limit=2){
  const n=map.length, usedC=new Set(),usedR=new Set(),ans=new Array(n).fill(-1),solutions=[];
  function search(rem){
    if(solutions.length>=limit)return;
    if(!rem.length){solutions.push([...ans]);return}
    let bestRow=-1,bestCand=null;
    for(const row of rem){
      const cand=[];
      for(let col=0;col<n;col++){
        const reg=map[row][col]; if(usedC.has(col)||usedR.has(reg))continue;
        let adj=false;
        for(let rr=0;rr<n;rr++)if(ans[rr]>=0&&Math.abs(rr-row)<=1&&Math.abs(ans[rr]-col)<=1){adj=true;break}
        if(!adj)cand.push(col);
      }
      if(!cand.length)return;
      if(bestCand===null||cand.length<bestCand.length){bestRow=row;bestCand=cand}
    }
    const next=rem.filter(x=>x!==bestRow);
    for(const col of bestCand){
      const reg=map[bestRow][col]; ans[bestRow]=col;usedC.add(col);usedR.add(reg);
      search(next);usedC.delete(col);usedR.delete(reg);ans[bestRow]=-1;
      if(solutions.length>=limit)return;
    }
  }
  search(Array.from({length:n},(_,i)=>i)); return solutions;
}
function scoreCandidate(map,sols){
  const n=map.length, counts=new Map();
  for(const row of map)for(const v of row)counts.set(v,(counts.get(v)||0)+1);
  if(counts.size!==n)return -1;
  let conn=0;for(let i=0;i<n;i++)if(connected(i,map))conn++;
  const reasonable=[...counts.values()].filter(v=>v>=1&&v<=n*3).length;
  return conn/n*.55+reasonable/n*.15+(sols.length?0.30:0);
}
solveBtn.addEventListener("click", ()=>{
  if(!sourceImage)return;
  solution=null; drawSource(); setStatus("正在辨識與求解…");
  setTimeout(()=>{
    try{
      const rect=currentRect(), forced=sizeSelect.value==="auto"?null:+sizeSelect.value;
      const sizes=forced?[forced]:[9,10,11,12,8,7,13,14];
      let best=null;
      for(const n of sizes){
        const map=buildMap(rect,n), sols=map?solveMap(map,2):[];
        const score=map?scoreCandidate(map,sols):-1;
        if(sols.length && (!best||score>best.score))best={n,map,sols,score};
      }
      if(!best)throw new Error("找不到合法解。請確認截圖只包含完整棋盤，或手動選擇棋盤尺寸／微調棋盤框。");
      solution={n:best.n,cols:best.sols[0]}; boardRect=rect; drawSource(); saveBtn.disabled=false;
      const pos=best.sols[0].map((c,r)=>`R${r+1}C${c+1}`).join("、");
      answerEl.textContent=pos;
      setStatus(`完成：${best.n}×${best.n}。${best.sols.length>1?"偵測到多解，可能需要微調辨識。":"已找到解答。"}`,"ok");
    }catch(e){ setStatus(e.message||"解題失敗。","err"); }
  },30);
});
saveBtn.addEventListener("click", ()=>{
  if(!solution)return;
  canvas.toBlob(blob=>{
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="meowdoku_answer.png";a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  },"image/png");
});
updateVals();
})();