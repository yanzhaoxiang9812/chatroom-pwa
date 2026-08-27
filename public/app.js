var ws=null,myName='',currentRoomId='',lastActivity=Date.now(),pendingImg='';
var userStates={};
var hiddenSince=0;
function avatarLetter(name){return name?name.charAt(0).toUpperCase():'?'}
document.getElementById('msg-input').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}});
document.getElementById('msg-input').addEventListener('focus',function(){var p=document.getElementById('emoji-panel');if(p)p.style.display='none';});
function showImgPreview(dataUrl){
pendingImg=dataUrl;
var pv=document.getElementById('img-preview');
pv.innerHTML='';
var img=document.createElement('img');img.src=dataUrl;
var rm=document.createElement('button');rm.className='remove-img';rm.textContent='×';rm.onclick=function(){pendingImg='';pv.style.display='none';pv.innerHTML=''};
pv.appendChild(img);pv.appendChild(rm);pv.style.display='block';
}
function handleFileSelect(input){
var file=input.files&&input.files[0];
if(!file)return;
if(file.size>2000000){showToast('图片太大，请压缩后重试');input.value='';return}
var reader=new FileReader();
reader.onload=function(ev){showImgPreview(ev.target.result)};
reader.readAsDataURL(file);
input.value='';
}
document.getElementById('msg-input').addEventListener('paste',function(e){
var items=e.clipboardData&&e.clipboardData.items;
if(!items)return;
for(var i=0;i<items.length;i++){
if(items[i].type.indexOf('image')===0){
e.preventDefault();
var file=items[i].getAsFile();
var reader=new FileReader();
reader.onload=function(ev){
if(ev.target.result.length>2000000){showToast('图片太大，请压缩后重试');return}
showImgPreview(ev.target.result);
};
reader.readAsDataURL(file);
return;
}
}
});
function joinRoom(roomId){
roomId=String(roomId).trim();
if(!roomId){showToast('请输入房间号');return}
var savedName='';try{savedName=localStorage.getItem('xchat_name')||''}catch(e){}
myName=savedName||('用户'+Math.floor(Math.random()*9000+1000));
doJoin(roomId)
}
function doJoin(roomId){
currentRoomId=roomId;
var protocol=location.protocol==='https:'?'wss:':'ws:';
ws=new WebSocket(protocol+'//'+location.host+'/ws?room='+encodeURIComponent(roomId));
ws.onopen=function(){ws.send(JSON.stringify({type:'join',roomId:roomId,name:myName}))};
ws.onmessage=function(ev){handleMessage(JSON.parse(ev.data))};
ws.onclose=function(){if(currentRoomId){setTimeout(function(){if(currentRoomId)doJoin(currentRoomId)},1000)}};
ws.onerror=function(){showToast('连接失败，请重试')}
}
function handleMessage(d){
if(d.type==='joined'){
var m=document.getElementById('messages');m.innerHTML='';
d.history.forEach(function(msg){appendMessage(msg)});
appendSystem('你进入了房间 #'+d.roomId);
setTimeout(function(){m.scrollTop=m.scrollHeight},50);
document.getElementById('msg-input').focus();
sendStatus();
try{localStorage.setItem('xchat_lastroom',d.roomId)}catch(e){}
}else if(d.type==='chat'){appendMessage(d)}
else if(d.type==='system'){appendSystem(d.message)}
else if(d.type==='status'){var prevLeftAt=(userStates[d.name]&&userStates[d.name].leftAt)||0;userStates[d.name]={device:d.device,visible:d.visible,leftAt:d.visible?0:prevLeftAt||Date.now()};updateStatusDisplay()}
else if(d.type==='left'){if(userStates[d.name]){userStates[d.name].visible='left';if(!userStates[d.name].leftAt)userStates[d.name].leftAt=Date.now()}updateStatusDisplay()}
else if(d.type==='error'){showToast(d.message)}
}
function appendMessage(msg){
var m=document.getElementById('messages');
if(!m)return;
while(m.children.length>100){m.removeChild(m.firstChild)}
var isSelf=msg.name===myName;
var row=document.createElement('div');
row.className='msg-row '+(isSelf?'self':'other');
var av=document.createElement('div');av.className='avatar';av.textContent=avatarLetter(msg.name);
row.appendChild(av);
var body=document.createElement('div');body.className='msg-body';
var line=document.createElement('div');line.className='msg-line';
var nm=document.createElement('span');nm.className='msg-name';nm.textContent=isSelf?'我':msg.name;if(msg.name===myName){nm.style.cursor='pointer';nm.title='Click to rename';nm.addEventListener('click',function(ev){ev.stopPropagation();showRenameModal()})};line.appendChild(nm);
body.appendChild(line);
var bub=document.createElement('div');bub.className='msg-bubble';
if(msg.img){bub.style.background='transparent';bub.style.boxShadow='none';var isWechatEmoji=msg.img.indexOf('/emojis/')!==-1;var img=document.createElement('img');img.src=msg.img;img.style.maxWidth=isWechatEmoji?'20px':'180px';img.style.maxHeight=isWechatEmoji?'20px':'180px';img.style.borderRadius='8px';img.style.cursor='pointer';img.onclick=function(){openImgViewer(msg.img)};bub.appendChild(img)}
else{
if(isSingleEmoji(msg.text)){
bub.style.background='transparent';
bub.appendChild(twemojiImg(msg.text,16))
}else{bub.textContent=msg.text}
}
body.appendChild(bub);
var tm=document.createElement('div');tm.className='msg-time';tm.textContent=fmtTime(msg.time);body.appendChild(tm);
row.appendChild(body);m.appendChild(row);m.scrollTop=m.scrollHeight
}
function appendSystem(text){
var m=document.getElementById('messages');
var div=document.createElement('div');div.className='msg system';div.textContent=text;
m.appendChild(div);m.scrollTop=m.scrollHeight
}
function sendMessage(){
var input=document.getElementById('msg-input');
var text=input.value.trim();
var img=pendingImg;
if(!text&&!img)return;
if(!ws||ws.readyState!==1)return;
ws.send(JSON.stringify({type:'chat',text:text,img:img||null}));
input.value='';pendingImg='';
input.blur();
var pv=document.getElementById('img-preview');pv.style.display='none';pv.innerHTML='';
lastActivity=Date.now()
}
function closeAllPopups(){
var ep=document.getElementById('emoji-panel');if(ep)ep.style.display='none';
var ip=document.getElementById('img-preview');if(ip){ip.style.display='none';ip.innerHTML=''}
var iv=document.getElementById('img-viewer');if(iv)iv.classList.remove('show');
closeOverlay('rename-overlay');
pendingImg='';
}
function closeOverlay(id){document.getElementById(id).classList.remove('show')}
function showRenameModal(){document.getElementById('rename-input').value=myName;document.getElementById('rename-overlay').classList.add('show')}

function doRename(){
var newName=document.getElementById('rename-input').value.trim();
if(!newName){showToast('昵称不能为空');return}
var oldName=myName;
if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'rename',name:newName}));
myName=newName;
try{localStorage.setItem('xchat_name',newName)}catch(e){}
if(oldName&&userStates[oldName]){userStates[newName]=userStates[oldName];delete userStates[oldName]}
updateStatusDisplay();
closeOverlay('rename-overlay')
}
function fmtTime(ts){var d=new Date(ts);return('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)}
function sendStatus(forceLeft){
if(ws&&ws.readyState===1){
var vis=forceLeft?'left':(!document.hidden);
ws.send(JSON.stringify({type:'status',name:myName,device:/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)?'mobile':'desktop',visible:vis}))
}
}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function updateStatusDisplay(){
var bar=document.getElementById('user-bar');
if(!bar)return;
var selfVisible=!document.hidden;
var now=Date.now();
var names=Object.keys(userStates);
var html='';
for(var i=0;i<names.length;i++){
var n=names[i];
if(n===myName)continue;
var st=userStates[n];
var v=st.visible===true;
if(!v&&st.leftAt&&(now-st.leftAt>600000))continue;
html+='<span class="user-item '+(v?'online':'offline')+'">'+escapeHtml(n)+'</span>';
}
bar.innerHTML=html;
}
function openImgViewer(src){
document.getElementById('img-viewer-img').src=src;
document.getElementById('img-viewer').classList.add('show')
}
function closeImgViewer(){
document.getElementById('img-viewer').classList.remove('show')
}
document.addEventListener('keydown',function(e){
if(e.key==='Escape')closeImgViewer()
});
var WECHAT_EMOJIS=[{name:'微笑',cat:'face',path:'face/微笑.png'},{name:'撇嘴',cat:'face',path:'face/撇嘴.png'},{name:'色',cat:'face',path:'face/色.png'},{name:'得意',cat:'face',path:'face/得意.png'},{name:'流泪',cat:'face',path:'face/流泪.png'},{name:'害羞',cat:'face',path:'face/害羞.png'},{name:'闭嘴',cat:'face',path:'face/闭嘴.png'},{name:'睡',cat:'face',path:'face/睡.png'},{name:'大哭',cat:'face',path:'face/大哭.png'},{name:'尴尬',cat:'face',path:'face/尴尬.png'},{name:'发怒',cat:'face',path:'face/发怒.png'},{name:'调皮',cat:'face',path:'face/调皮.png'},{name:'呲牙',cat:'face',path:'face/呲牙.png'},{name:'惊讶',cat:'face',path:'face/惊讶.png'},{name:'难过',cat:'face',path:'face/难过.png'},{name:'抓狂',cat:'face',path:'face/抓狂.png'},{name:'吐',cat:'face',path:'face/吐.png'},{name:'偷笑',cat:'face',path:'face/偷笑.png'},{name:'白眼',cat:'face',path:'face/白眼.png'},{name:'傲慢',cat:'face',path:'face/傲慢.png'},{name:'困',cat:'face',path:'face/困.png'},{name:'惊恐',cat:'face',path:'face/惊恐.png'},{name:'憨笑',cat:'face',path:'face/憨笑.png'},{name:'悠闲',cat:'face',path:'face/悠闲.png'},{name:'咒骂',cat:'face',path:'face/咒骂.png'},{name:'疑问',cat:'face',path:'face/疑问.png'},{name:'嘘',cat:'face',path:'face/嘘.png'},{name:'晕',cat:'face',path:'face/晕.png'},{name:'衰',cat:'face',path:'face/衰.png'},{name:'骷髅',cat:'face',path:'face/骷髅.png'},{name:'敲打',cat:'face',path:'face/敲打.png'},{name:'再见',cat:'face',path:'face/再见.png'},{name:'擦汗',cat:'face',path:'face/擦汗.png'},{name:'抠鼻',cat:'face',path:'face/抠鼻.png'},{name:'鼓掌',cat:'face',path:'face/鼓掌.png'},{name:'坏笑',cat:'face',path:'face/坏笑.png'},{name:'右哼哼',cat:'face',path:'face/右哼哼.png'},{name:'鄙视',cat:'face',path:'face/鄙视.png'},{name:'委屈',cat:'face',path:'face/委屈.png'},{name:'快哭了',cat:'face',path:'face/快哭了.png'},{name:'阴险',cat:'face',path:'face/阴险.png'},{name:'亲亲',cat:'face',path:'face/亲亲.png'},{name:'可怜',cat:'face',path:'face/可怜.png'},{name:'发呆',cat:'face',path:'face/发呆.png'},{name:'翻白眼',cat:'face',path:'face/翻白眼.png'},{name:'汗',cat:'face',path:'face/汗.png'},{name:'好的',cat:'face',path:'face/好的.png'},{name:'嘿哈',cat:'face',path:'face/嘿哈.png'},{name:'机智',cat:'face',path:'face/机智.png'},{name:'加油',cat:'face',path:'face/加油.png'},{name:'奸笑',cat:'face',path:'face/奸笑.png'},{name:'囧',cat:'face',path:'face/囧.png'},{name:'恐惧',cat:'face',path:'face/恐惧.png'},{name:'苦涩',cat:'face',path:'face/苦涩.png'},{name:'裂开',cat:'face',path:'face/裂开.png'},{name:'脸红',cat:'face',path:'face/脸红.png'},{name:'破涕为笑',cat:'face',path:'face/破涕为笑.png'},{name:'让我看看',cat:'face',path:'face/让我看看.png'},{name:'社会社会',cat:'face',path:'face/社会社会.png'},{name:'生病',cat:'face',path:'face/生病.png'},{name:'失望',cat:'face',path:'face/失望.png'},{name:'叹气',cat:'face',path:'face/叹气.png'},{name:'天啊',cat:'face',path:'face/天啊.png'},{name:'哇',cat:'face',path:'face/哇.png'},{name:'旺柴',cat:'face',path:'face/旺柴.png'},{name:'无语',cat:'face',path:'face/无语.png'},{name:'捂脸',cat:'face',path:'face/捂脸.png'},{name:'笑脸',cat:'face',path:'face/笑脸.png'},{name:'耶',cat:'face',path:'face/耶.png'},{name:'愉快',cat:'face',path:'face/愉快.png'},{name:'皱眉',cat:'face',path:'face/皱眉.png'},{name:'666',cat:'face',path:'face/666.png'},{name:'Emm',cat:'face',path:'face/Emm.png'},{name:'吃瓜',cat:'face',path:'face/吃瓜.png'},{name:'打脸',cat:'face',path:'face/打脸.png'},{name:'OK',cat:'gesture',path:'gesture/OK.png'},{name:'抱拳',cat:'gesture',path:'gesture/抱拳.png'},{name:'勾引',cat:'gesture',path:'gesture/勾引.png'},{name:'合十',cat:'gesture',path:'gesture/合十.png'},{name:'强',cat:'gesture',path:'gesture/强.png'},{name:'拳头',cat:'gesture',path:'gesture/拳头.png'},{name:'弱',cat:'gesture',path:'gesture/弱.png'},{name:'胜利',cat:'gesture',path:'gesture/胜利.png'},{name:'握手',cat:'gesture',path:'gesture/握手.png'},{name:'拥抱',cat:'gesture',path:'gesture/拥抱.png'},{name:'猪头',cat:'animal',path:'animal/猪头.png'},{name:'跳跳',cat:'animal',path:'animal/跳跳.png'},{name:'发抖',cat:'animal',path:'animal/发抖.png'},{name:'转圈',cat:'animal',path:'animal/转圈.png'},{name:'庆祝',cat:'blessing',path:'blessing/庆祝.png'},{name:'红包',cat:'blessing',path:'blessing/红包.png'},{name:'烟花',cat:'blessing',path:'blessing/烟花.png'},{name:'爆竹',cat:'blessing',path:'blessing/爆竹.png'},{name:'發',cat:'blessing',path:'blessing/發.png'},{name:'福',cat:'blessing',path:'blessing/福.png'},{name:'礼物',cat:'blessing',path:'blessing/礼物.png'},{name:'爱心',cat:'other',path:'other/爱心.png'},{name:'啤酒',cat:'other',path:'other/啤酒.png'},{name:'蛋糕',cat:'other',path:'other/蛋糕.png'},{name:'太阳',cat:'other',path:'other/太阳.png'},{name:'炸弹',cat:'other',path:'other/炸弹.png'},{name:'玫瑰',cat:'other',path:'other/玫瑰.png'},{name:'咖啡',cat:'other',path:'other/咖啡.png'},{name:'嘴唇',cat:'other',path:'other/嘴唇.png'},{name:'心碎',cat:'other',path:'other/心碎.png'},{name:'月亮',cat:'other',path:'other/月亮.png'},{name:'便便',cat:'other',path:'other/便便.png'},{name:'菜刀',cat:'other',path:'other/菜刀.png'},{name:'凋谢',cat:'other',path:'other/凋谢.png'}]
var currentEmojiTab='basic';
function toggleEmojiPanel(){
var p=document.getElementById('emoji-panel');
if(p.style.display==='none'||p.style.display===''){p.style.display='block';renderRecentEmojis();renderEmojiGrid()}
else{p.style.display='none'}
}
document.addEventListener('click',function(e){
var p=document.getElementById('emoji-panel');
if(!p||p.style.display==='none')return;
if(p.contains(e.target))return;
if(e.target.id==='emoji-btn')return;
p.style.display='none';
});
function showEmojiTab(tab){
currentEmojiTab=tab;
var tabs=document.querySelectorAll('.emoji-tab');
tabs.forEach(function(t){t.classList.remove('active')});
tabs[tab==='basic'?0:1].classList.add('active');
renderRecentEmojis();
renderEmojiGrid()
}
function renderEmojiGrid(){
var grid=document.getElementById('emoji-grid');
if(!grid)return;
grid.innerHTML='';
if(currentEmojiTab==='basic'){
WECHAT_EMOJIS.forEach(function(e){
var d=document.createElement('div');d.className='emoji-item';
var img=document.createElement('img');
img.src=wechatEmojiUrl(e);
img.alt=e.name;
img.style.cssText='width:28px;height:28px;object-fit:contain;display:inline-block;';
d.appendChild(img);
d.title=e.name;
d.onclick=function(){sendEmoji(e.name)};
grid.appendChild(d)
})
}else{
var customs=getCustomEmojis();
if(!customs.length){
grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#666;font-size:13px;padding:20px 0">暂无自定义表情，点右上角 + 上传</div>'
}else{
customs.forEach(function(src,i){
var d=document.createElement('div');d.className='emoji-item';d.style.position='relative';
var img=document.createElement('img');img.src=src;img.style.cssText='width:28px;height:28px;object-fit:contain;border-radius:4px;';
d.appendChild(img);
d.onclick=function(){sendEmoji(src)};
var del=document.createElement('span');del.style.cssText='position:absolute;top:0;right:0;font-size:10px;color:#ef4444;cursor:pointer;display:none';del.textContent='\u00d7';
d.onmouseenter=function(){del.style.display='block'};
d.onmouseleave=function(){del.style.display='none'};
del.onclick=function(ev){ev.stopPropagation();deleteCustomEmoji(i)};
d.appendChild(del);
grid.appendChild(d)
})
}
}
}
function sendEmoji(emoji){
if(!ws||ws.readyState!==1)return;
var isImg=emoji.indexOf('data:image')===0;
var isWechat=!isImg&&WECHAT_EMOJIS.some(function(e){return e.name===emoji});
var img=isImg?emoji:(isWechat?wechatEmojiUrl(WECHAT_EMOJIS.find(function(e){return e.name===emoji})):null);
ws.send(JSON.stringify({type:'chat',text:img?'':emoji,img:img}));
pushRecentEmoji(emoji);
renderRecentEmojis();
document.getElementById('emoji-panel').style.display='none';
lastActivity=Date.now()
}
function getCustomEmojis(){
try{return JSON.parse(localStorage.getItem('xchat_custom_emojis')||'[]')}catch(e){return[]}
}
function saveCustomEmojis(list){
try{localStorage.setItem('xchat_custom_emojis',JSON.stringify(list))}catch(e){showToast('存储空间不足，无法保存表情')}
}
function handleEmojiUpload(input){
var file=input.files&&input.files[0];
if(!file)return;
if(file.size>500000){showToast('表情图片不能超过500KB');input.value='';return}
var reader=new FileReader();
reader.onload=function(ev){
var dataUrl=ev.target.result;
var img=new Image();
img.onload=function(){
var canvas=document.createElement('canvas');
var size=64;
canvas.width=size;canvas.height=size;
var ctx=canvas.getContext('2d');
var scale=Math.min(size/img.width,size/img.height);
var w=img.width*scale,h=img.height*scale;
ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
var small=canvas.toDataURL('image/png');
var list=getCustomEmojis();
list.push(small);
saveCustomEmojis(list);
renderEmojiGrid();
showToast('表情已添加')
};
img.src=dataUrl;
};
reader.readAsDataURL(file);
input.value='';
}
function deleteCustomEmoji(index){
var list=getCustomEmojis();
list.splice(index,1);
saveCustomEmojis(list);
renderEmojiGrid()
}
function getRecentEmojis(){
try{return JSON.parse(localStorage.getItem('xchat_recent_emojis')||'[]')}catch(e){return[]}
}
function pushRecentEmoji(emoji){
var list=getRecentEmojis();
list=list.filter(function(e){return e!==emoji});
list.unshift(emoji);
if(list.length>10)list=list.slice(0,10);
try{localStorage.setItem('xchat_recent_emojis',JSON.stringify(list))}catch(e){}
}
function renderRecentEmojis(){
var wrap=document.getElementById('emoji-recent');
var grid=document.getElementById('emoji-recent-grid');
if(!wrap||!grid)return;
if(currentEmojiTab!=='basic'){wrap.style.display='none';return}
var list=getRecentEmojis();
grid.innerHTML='';
if(!list.length){wrap.style.display='none';return}
wrap.style.display='block';
list.forEach(function(name){
var d=document.createElement('div');d.className='emoji-item';
var wechat=findWechatEmoji(name);
var img=document.createElement('img');
if(wechat){img.src=wechatEmojiUrl(wechat)}
else if(name.indexOf('data:image')===0){img.src=name}
else{img=twemojiImg(name,28)}
img.alt=name;
img.style.cssText='width:28px;height:28px;object-fit:contain;display:inline-block;';
d.appendChild(img);
d.title=name;
d.onclick=function(){sendEmoji(name)};
grid.appendChild(d)
})
}
function isSingleEmoji(text){
if(!text)return false;
var trimmed=text.trim();
if(!trimmed)return false;
var codePoints=Array.from(trimmed);
if(codePoints.length>2)return false;
return codePoints.every(function(c){
var cp=c.codePointAt(0);
return (cp>=0x1F000&&cp<=0x1FAFF)||(cp>=0x2600&&cp<=0x27BF)||(cp>=0x2B00&&cp<=0x2BFF)||(cp>=0x1F1E6&&cp<=0x1F1FF)||cp===0x200D||cp===0xFE0F||cp===0x20E3;
})
}
function twemojiImg(emoji,size){
var img=document.createElement('img');
var codes=Array.from(emoji).map(function(c){return c.codePointAt(0).toString(16)}).join('-');
img.src='https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/'+codes+'.png';
img.style.cssText='width:'+size+'px;height:'+size+'px;object-fit:contain;display:inline-block;vertical-align:middle;';
img.alt=emoji;
img.onerror=function(){var span=document.createElement('span');span.textContent=emoji;span.style.cssText='font-size:'+size+'px;vertical-align:middle;';img.parentNode.replaceChild(span,img)};
return img
}
function wechatEmojiUrl(emoji){
return location.origin+'/emojis/'+emoji.path
}
function findWechatEmoji(name){
for(var i=0;i<WECHAT_EMOJIS.length;i++){
if(WECHAT_EMOJIS[i].name===name)return WECHAT_EMOJIS[i]
}
return null
}
function showToast(msg){var t=document.getElementById('error-toast');t.textContent=msg;t.style.display='block';setTimeout(function(){t.style.display='none'},3000)}
window.addEventListener('load',function(){
var path=location.pathname.replace('/','').trim();
var roomId=(path&&/^[0-9]+$/.test(path))?path:'666';
joinRoom(roomId)
});
var heartbeatWorker=null;
function startHeartbeat(){
if(heartbeatWorker)return;
var code='setInterval(function(){postMessage(1)},3000)';
var blob=new Blob([code],{type:'application/javascript'});
heartbeatWorker=new Worker(URL.createObjectURL(blob));
heartbeatWorker.onmessage=function(){
if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'ping'}));
};
}
startHeartbeat();
document.addEventListener('visibilitychange',function(){
if(currentRoomId){
if(document.hidden){
hiddenSince=Date.now();
sendStatus();
}else{
if(hiddenSince&&Date.now()-hiddenSince>1800000){sendStatus(true)}
hiddenSince=0;
sendStatus();
lastActivity=Date.now();
if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'ping'}))}
else if(ws&&ws.readyState===0){ws.close()}
}
}
});
setInterval(function(){
if(document.hidden&&currentRoomId&&hiddenSince&&Date.now()-hiddenSince>1800000){
sendStatus(true);
hiddenSince=0;
}
updateStatusDisplay();
},60000);
// ---- PWA: 注册 Service Worker ----
if('serviceWorker' in navigator){
window.addEventListener('load',function(){
navigator.serviceWorker.register('/sw.js').catch(function(e){console.log('SW register failed',e)});
});
}
