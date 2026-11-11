(function(){
  "use strict";
  var reduser = matchMedia("(prefers-reduced-motion: reduce)");

  // Fjær med Apples to parametere: dempingsforhold (zeta) og respons (sekunder). Masse 1. (Samme som i prototype A.)
  function Fjar(x, zeta, respons){ this.x=x; this.v=0; this.mal=x; this.sett(zeta, respons); }
  Fjar.prototype.sett=function(zeta, respons){ this.k=Math.pow(2*Math.PI/respons,2); this.c=4*Math.PI*zeta/respons; };
  Fjar.prototype.steg=function(dt){ var n=Math.ceil(dt/(1/240)), h=dt/n; for(var i=0;i<n;i++){ var a=-this.k*(this.x-this.mal)-this.c*this.v; this.v+=a*h; this.x+=this.v*h; } };
  Fjar.prototype.hvile=function(e){ e=e||0.0005; return Math.abs(this.v)<e*4 && Math.abs(this.x-this.mal)<e; };
  Fjar.prototype.hopp=function(){ this.x=this.mal; this.v=0; };

  function klem(x,a,b){ return x<a?a:(x>b?b:x); }
  function lerp(a,b,u){ return a+(b-a)*u; }

  // Demonteringen, i den rekkefølgen en tekniker gjør det. Hele demonteringen skjer i første rulling (se tidslinje()).
  // [trinn, dx, dy, rotasjon] i tegningens enheter; en del kan flyttes i flere trinn (foten tar trinsene med seg).
  var FLYTT={
    armV:[[1,-64,-50,-6]], armH:[[1,64,-50,6]],
    rygg:[[2,0,-118,-4]],
    sete:[[3,0,-40,0]],
    fot:[[4,0,74,0]], hjul:[[4,0,74,0],[6,0,36,0]],
    gass:[[5,0,34,0]], mek:[[5,0,-2,0]]
  };
  // etiketter og ledelinjer (fra prototype A)
  var MERK={
    rygg:{navn:"Rygg", lx:200,ly:40, ex:330,ey:-20},
    armV:{navn:"Armlene", lx:60,ly:232, ex:-40,ey:170},
    armH:{navn:"Armlene", lx:340,ly:232, ex:420,ey:170},
    sete:{navn:"Sete", lx:300,ly:300, ex:420,ey:262},
    mek:{navn:"Mekanisme", lx:240,ly:350, ex:420,ey:356},
    gass:{navn:"Gasslift", lx:184,ly:450, ex:-40,ey:460},
    fot:{navn:"Fot", lx:340,ly:530, ex:420,ey:580},
    hjul:{navn:"Trinser", lx:56,ly:556, ex:-40,ey:660}
  };
  // én del per skjerm, trinn 7 til 13. Trinsene: vi zoomer inn på de to til venstre.
  var NAERBILDE=[["rygg"],["sete"],["armV","armH"],["mek"],["gass"],["fot"],[{x:38,y:538,w:110,h:46}]];
  var FORSTE_DEL=7, SAMLET=14;
  var OVER=["rygg","armV","armH","sete","mek"]; // delene over gassliften, som synker når man trykker
  var NS="http://www.w3.org/2000/svg";

  var svg=document.getElementById("svg"), scene=document.getElementById("scene");
  var kamera=document.getElementById("kamera"), alt=document.getElementById("alt");
  var stang=document.getElementById("stang"), ledere=document.getElementById("ledere"), etik=document.getElementById("etiketter");
  var reise=document.getElementById("reise"), seksjoner=[].slice.call(document.querySelectorAll(".trinn"));
  var viser=document.getElementById("viser"), viserT=document.getElementById("viser-t"), liste=document.getElementById("trinnliste");
  var trinser=[].slice.call(svg.querySelectorAll(".trinse")).map(function(g){ var c=g.dataset.c.split(" ").map(Number); return {g:g,x:c[0],y:c[1]}; });

  var el={}, boks={}, fj={};
  Object.keys(FLYTT).forEach(function(k, i){
    var g=svg.querySelector('.del[data-k="'+k+'"]'); el[k]=g;
    var b=g.getBBox(); boks[k]={x:b.x,y:b.y,w:b.width,h:b.height};
    // snittskravur: strek som blir objekt (Igloo Inc). Klones over fyllet og tones inn når delen står alene.
    [].forEach.call(g.querySelectorAll(".fyll"),function(f){ var s=f.cloneNode(); s.setAttribute("class","snitt"); s.removeAttribute("id"); f.parentNode.insertBefore(s,f.nextSibling); });
    // hver del har sine egne fjærer for x, y og rotasjon. Litt ulik respons gir et lite etterslep mellom delene.
    var resp=0.30+0.035*i;
    fj[k]={x:new Fjar(0,0.78,resp), y:new Fjar(0,0.78,resp), r:new Fjar(0,0.78,resp), o:new Fjar(1,1,0.3), s:new Fjar(0,1,0.3)};
  });

  // etiketter
  var lab={};
  Object.keys(MERK).forEach(function(k){
    var l=document.createElementNS(NS,"path"); l.setAttribute("class","leder"); ledere.appendChild(l);
    var g=document.createElementNS(NS,"g"), r=document.createElementNS(NS,"rect"), t=document.createElementNS(NS,"text");
    r.setAttribute("class","etikett-boks"); t.setAttribute("class","etikett"); t.textContent=MERK[k].navn;
    g.appendChild(r); g.appendChild(t); etik.appendChild(g);
    lab[k]={l:l,g:g,t:t,r:r,w:60};
  });
  var fs=1;
  function malEtiketter(){
    var h=svg.getBoundingClientRect().height||720; fs=Math.max(1,720/h);
    Object.keys(lab).forEach(function(k){ lab[k].t.style.fontSize=(12*fs)+"px"; try{ lab[k].w=lab[k].t.getBBox().width; }catch(e){} });
  }

  // ---------- fra rulling til tilstand ----------
  function fjernet(t, trinn){ return klem(t-(trinn-1),0,1) * (1-klem(t-(SAMLET-1),0,1)); }
  function forskyvning(k, t){
    var x=0,y=0,r=0; FLYTT[k].forEach(function(s){ var u=fjernet(t,s[0]); x+=s[1]*u; y+=s[2]*u; r+=s[3]*u; }); return {x:x,y:y,r:r};
  }
  function sprengt(t){ return klem(t/6,0,1)*(1-klem(t-(SAMLET-1),0,1)); }
  function altSkala(P){ var Pk=Math.min(1.2,P); return {s:1-0.2*Pk, my:300+7*Pk}; }

  // kameraets mål for hver del: midten av delen i sprengt stilling, og en zoom som fyller omtrent 60 % av tegneflaten
  var fokus=NAERBILDE.map(function(liste){
    var x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    liste.filter(function(k){ return k!=="armV"; }).forEach(function(k){   // armlenene: kameraet går tett på det ene, begge markeres
      var b=(typeof k==="string")? boks[k] : k, f=(typeof k==="string")? forskyvning(k,6) : forskyvning("hjul",6);
      x0=Math.min(x0,b.x+f.x); y0=Math.min(y0,b.y+f.y); x1=Math.max(x1,b.x+b.w+f.x); y1=Math.max(y1,b.y+b.h+f.y);
    });
    var a=altSkala(1), cx=(x0+x1)/2, cy=(y0+y1)/2;
    cx=200+(cx-200)*a.s; cy=a.my+(cy-a.my)*a.s;
    return {x:cx,y:cy,w:(x1-x0)*a.s,h:(y1-y0)*a.s};
  });
  var NOYTRAL={x:200,y:300,z:1}, synligB=520, synligH=720;
  // hvor stor delen blir: omtrent 60 % av den synlige tegneflaten, så den står stor og alene både på PC og mobil
  function malSynlig(){ var r=svg.getBoundingClientRect(), sk=Math.min(r.width/520, r.height/720)||1; synligB=r.width/sk; synligH=r.height/sk; }
  function zoom(f){ return klem(Math.min(0.6*synligB/f.w, 0.6*synligH/f.h),1,4); }
  function kameraMal(T){
    var a,b,u;
    if(T<=FORSTE_DEL-1) return NOYTRAL;
    var F=function(i){ var f=fokus[i]; return {x:f.x,y:f.y,z:zoom(f)}; };
    if(T<FORSTE_DEL){ a=NOYTRAL; b=F(0); u=T-(FORSTE_DEL-1); }
    else if(T<SAMLET-1){ var i=Math.floor(T-FORSTE_DEL); a=F(i); b=F(Math.min(i+1,6)); u=T-FORSTE_DEL-i; }
    else if(T<SAMLET){ a=F(6); b=NOYTRAL; u=T-(SAMLET-1); }
    else return NOYTRAL;
    return {x:lerp(a.x,b.x,u), y:lerp(a.y,b.y,u), z:Math.exp(lerp(Math.log(a.z),Math.log(b.z),u))};
  }
  function demp(T){ return klem(T-(FORSTE_DEL-1),0,1)*(1-klem(T-(SAMLET-1),0,1)); }
  function fokusPaa(k, T){
    var m=0; NAERBILDE.forEach(function(liste,i){ if(liste.indexOf(k)>=0 || (k==="hjul"&&i===6)) m=Math.max(m,1-Math.abs(T-(FORSTE_DEL+i))); });
    return klem(m,0,1);
  }

  // ---------- fjærer for helheten ----------
  var T=new Fjar(0,1,0.22);                 // rullingen, glattet (kamera, etiketter, skala)
  var kx=new Fjar(200,1,0.4), ky=new Fjar(300,1,0.4), kz=new Fjar(1,1,0.4);
  var q=new Fjar(0,0.5,0.32);               // gassliften: 0 = oppe, 1 = trykket helt ned
  var vinkel=0, vfart=0;                    // trinsene: grader og grader per sekund
  var t=0;                                  // tidslinjen: 0 hel stol, 1–6 demontering, 7–13 én del per skjerm, 14 samlet
  var s=0;                                  // rå rulleposisjon i seksjoner; første seksjon rommer hele demonteringen
  var SIST=SAMLET-(FORSTE_DEL-1);           // seksjonsindeksen til «Satt sammen igjen»
  function tidslinje(x){ return x<=1 ? x*FORSTE_DEL : x+(FORSTE_DEL-1); }

  function maal(){
    var tt = reduser.matches ? tidslinje(Math.round(s)) : t;   // redusert bevegelse: ingen scrubbing, hver seksjon viser sin faste tilstand
    T.mal=tt;
    Object.keys(FLYTT).forEach(function(k){ var f=forskyvning(k,tt); fj[k].x.mal=f.x; fj[k].y.mal=f.y; fj[k].r.mal=f.r; });
  }

  function tegn(){
    var TT=T.x, P=sprengt(TT), d=demp(TT), a=altSkala(P);
    Object.keys(FLYTT).forEach(function(k){
      var s=fj[k], ned=(OVER.indexOf(k)>=0)? q.x*38*(1-P) : 0, fo=fokusPaa(k,TT);
      s.o.mal=1-0.85*d*(1-fo); s.s.mal=fo;
      var x=s.x.x, y=s.y.x+ned, r=s.r.x;
      el[k].setAttribute("transform","translate("+x.toFixed(2)+" "+y.toFixed(2)+") rotate("+r.toFixed(2)+" 200 300)");
      el[k].style.opacity=s.o.x.toFixed(3);
      [].forEach.call(el[k].querySelectorAll(".snitt"),function(n){ n.style.opacity=(s.s.x*0.85).toFixed(3); });
      var L=lab[k], u=fjernet(TT,FLYTT[k][0][0])*(1-d), m=MERK[k];
      var sx=m.lx+x, sy=m.ly+y, ex=m.ex, ey=m.ey+y*0.2;
      L.l.setAttribute("d","M"+sx.toFixed(1)+" "+sy.toFixed(1)+" L"+ex.toFixed(1)+" "+ey.toFixed(1));
      L.l.style.opacity=u; L.g.style.opacity=u;
      var w=L.w+16*fs, left=ex<200? ex-w : ex; left=Math.max(-58,Math.min(left,458-w));
      L.r.setAttribute("x",left); L.r.setAttribute("y",ey-13*fs); L.r.setAttribute("width",w); L.r.setAttribute("height",26*fs);
      L.t.setAttribute("x",left+8*fs); L.t.setAttribute("y",ey+4.5*fs);
    });
    alt.setAttribute("transform","translate(200 "+a.my.toFixed(2)+") scale("+a.s.toFixed(4)+") translate(-200 "+(-a.my).toFixed(2)+")");
    kamera.setAttribute("transform","translate(200 300) scale("+kz.x.toFixed(4)+") translate("+(-kx.x).toFixed(2)+" "+(-ky.x).toFixed(2)+")");
    stang.setAttribute("transform","translate(0 "+(q.x*38).toFixed(2)+")");
    trinser.forEach(function(w){ w.g.setAttribute("transform","rotate("+vinkel.toFixed(1)+" "+w.x+" "+w.y+")"); });
  }

  var kjorer=false, sist=0, holder=false, dra=null;
  function alleFjarer(){ var l=[T,kx,ky,kz,q]; Object.keys(fj).forEach(function(k){ var s=fj[k]; l.push(s.x,s.y,s.r,s.o,s.s); }); return l; }
  var FJ=alleFjarer();
  function loop(now){
    var dt=Math.min(0.05,(now-sist)/1000||0.016); sist=now;
    var km=kameraMal(T.x); kx.mal=km.x; ky.mal=km.y; kz.mal=km.z;
    var hviler=true;
    FJ.forEach(function(f){ if(reduser.matches && f!==q){ f.hopp(); } else { f.steg(dt); if(!f.hvile()) hviler=false; } });
    if(reduser.matches){ var k2=kameraMal(T.x); kx.x=k2.x; ky.x=k2.y; kz.x=k2.z; }
    if(!dra && Math.abs(vfart)>1){ vinkel+=vfart*dt; vfart*=Math.pow(0.998, dt*1000); hviler=false; } // Apples retardasjon, d = 0,998 per ms
    else if(!dra) vfart=0;
    tegn();
    if(!hviler || holder || dra) requestAnimationFrame(loop); else kjorer=false;
  }
  function start(){ if(!kjorer){ kjorer=true; sist=performance.now(); requestAnimationFrame(loop); } }

  // ---------- rulleposisjonen leses når seksjonene krysser skjermen (IntersectionObserver, ingen scroll-lytter) ----------
  var naa=-1, hoyde=1;
  function maalHoyde(){ hoyde=seksjoner[0].offsetHeight||innerHeight; }
  function les(){
    s=klem((scrollY-reise.offsetTop)/hoyde,0,SIST+1); t=tidslinje(s);
    maal(); start(); oppdaterViser();
  }
  var terskler=[]; for(var i=0;i<=100;i++) terskler.push(i/100);
  var io=new IntersectionObserver(les,{threshold:terskler});
  seksjoner.forEach(function(s){ io.observe(s); }); io.observe(document.getElementById("slutt"));
  addEventListener("resize",function(){ maalHoyde(); malSynlig(); malEtiketter(); les(); });

  // Sikring for musehjul: noen nettlesere snapper et lite hjulutslag tilbake til samme trinn. Rullingen kapres ikke
  // (ingen preventDefault); bare hvis et utslag endte der det startet, ber vi nettleseren rulle ett trinn i samme retning.
  var hjulSum=0, hjulStart=0, hjulTid=0;
  addEventListener("wheel",function(e){
    if(e.ctrlKey || Math.abs(e.deltaX)>Math.abs(e.deltaY)) return;
    if(!hjulTid){ hjulSum=0; hjulStart=Math.round(s); }
    hjulSum+=e.deltaY*(e.deltaMode===1?40:1);
    clearTimeout(hjulTid);
    hjulTid=setTimeout(function(){
      hjulTid=0;
      var n=Math.round(s), retning=hjulSum>0?1:-1;
      if(Math.abs(hjulSum)>=30 && n===hjulStart && Math.abs(s-n)<0.02 && n+retning>=0 && n+retning<=SIST+1){
        var mal = n+retning<=SIST ? seksjoner[n+retning] : document.getElementById("slutt");
        mal.scrollIntoView({behavior: reduser.matches?"auto":"smooth", block: n+retning<=SIST?"start":"end"});
      }
    },220);
  },{passive:true});

  // ---------- trinnviseren i tegningshodet ----------
  var lenker=[].slice.call(liste.querySelectorAll("a"));
  function oppdaterViser(){
    var n=Math.round(t), tekst, mal;
    document.body.classList.toggle("ved-slutt", t>SAMLET+0.02);
    if(t>SAMLET+0.5){ tekst="Avtale og kontakt"; mal="#slutt"; }
    else { var sk=seksjoner[klem(Math.round(s),0,SIST)]; tekst=sk.dataset.viser; mal="#"+sk.id; }
    if(n===naa && viserT.textContent===tekst) return; naa=n;
    viserT.textContent=tekst;
    scene.classList.toggle("snurrbar", n===SAMLET-1);
    scene.classList.toggle("trykkbar", n===0||n===FORSTE_DEL+4||n===SAMLET);
    lenker.forEach(function(a){ if(a.getAttribute("href")===mal) a.setAttribute("aria-current","step"); else a.removeAttribute("aria-current"); });
    if(reduser.matches && svg.animate) svg.animate([{opacity:.35},{opacity:1}],{duration:180}); // toning i stedet for bevegelse
  }

  function aapne(){
    liste.hidden=false; viser.setAttribute("aria-expanded","true");
    if(!reduser.matches && liste.animate) liste.animate([{transform:"translateY(8px) scale(.96)",opacity:0},{transform:"none",opacity:1}],{duration:260,easing:"cubic-bezier(.2,.9,.25,1)"});
    var c=liste.querySelector('[aria-current]')||lenker[0]; c.focus();
  }
  function lukk(fokus){
    if(liste.hidden) return;
    viser.setAttribute("aria-expanded","false");
    var ferdig=function(){ liste.hidden=true; };
    if(!reduser.matches && liste.animate){ var an=liste.animate([{transform:"none",opacity:1},{transform:"translateY(8px) scale(.96)",opacity:0}],{duration:180,easing:"cubic-bezier(.4,0,.8,.75)"}); an.onfinish=ferdig; } else ferdig();
    if(fokus) viser.focus();
  }
  viser.addEventListener("click",function(){ if(liste.hidden) aapne(); else lukk(true); });
  liste.addEventListener("click",function(e){ if(e.target.closest("a")) lukk(false); });
  document.addEventListener("keydown",function(e){ if(e.key==="Escape" && !liste.hidden){ lukk(true); } });
  document.addEventListener("pointerdown",function(e){ if(!liste.hidden && !e.target.closest(".viser")) lukk(false); });
  liste.addEventListener("keydown",function(e){
    var i=lenker.indexOf(document.activeElement); if(i<0) return;
    if(e.key==="ArrowDown"){ e.preventDefault(); lenker[(i+1)%lenker.length].focus(); }
    if(e.key==="ArrowUp"){ e.preventDefault(); lenker[(i-1+lenker.length)%lenker.length].focus(); }
  });

  // ---------- fysisk samspill: gassliften trykkes ned, trinsene kan kastes rundt ----------
  function trinn(){ return Math.round(t); }
  function trykk(){ holder=true; q.sett(1,0.5); q.mal=1; if(reduser.matches) q.hopp(); start(); }     // respons på nedtrykk, med økende motstand
  function slipp(){ holder=false; q.sett(0.5,0.32); q.mal=0; if(reduser.matches) q.hopp(); start(); } // én tydelig sprett: energien kom fra trykket
  function skalaPx(){ var r=svg.getBoundingClientRect(); return (720/Math.max(1,r.height))/kz.x; }   // skjermpiksler til tegningens enheter

  scene.addEventListener("pointerdown",function(e){
    if(e.button>0) return;
    if(trinn()===SAMLET-1){
      dra={x:e.clientX, v0:vinkel, hist:[{x:e.clientX,t:e.timeStamp}], s:skalaPx()}; vfart=0;
      try{ scene.setPointerCapture(e.pointerId); }catch(_){}
      start();
    } else if(trinn()<=SAMLET){ trykk(); }
  });
  scene.addEventListener("pointermove",function(e){
    if(!dra) return;
    dra.hist.push({x:e.clientX,t:e.timeStamp}); if(dra.hist.length>6) dra.hist.shift();
    // trinsen ruller 1:1 med fingeren: buelengde = forflytning, radius 15 enheter
    vinkel=dra.v0+((e.clientX-dra.x)*dra.s/15)*180/Math.PI;
  });
  function slutt(e){
    if(dra){
      var a=dra.hist[0], b=dra.hist[dra.hist.length-1], dt=Math.max(1,b.t-a.t);
      var px=(b.x-a.x)/dt*1000;                       // piksler per sekund
      vfart = reduser.matches ? 0 : (px*dra.s/15)*180/Math.PI; // farten overleveres, ingen søm mellom dra og glid
      dra=null; start(); return;
    }
    if(holder) slipp();
  }
  scene.addEventListener("pointerup",slutt); scene.addEventListener("pointercancel",slutt); scene.addEventListener("pointerleave",function(){ if(holder) slipp(); });
  scene.addEventListener("keydown",function(e){
    if(e.key==="Enter"||e.key===" "){ e.preventDefault(); q.x=reduser.matches?0:0.9; q.v=0; slipp(); }
    else if(trinn()===SAMLET-1 && (e.key==="ArrowLeft"||e.key==="ArrowRight")){ e.preventDefault(); vfart+=(e.key==="ArrowRight"?1:-1)*(reduser.matches?0:540); if(reduser.matches) vinkel+=(e.key==="ArrowRight"?45:-45); start(); }
  });

  // ---------- oppstart ----------
  maalHoyde(); malSynlig(); malEtiketter(); les();
  Object.keys(fj).forEach(function(k){ var s=fj[k]; s.x.hopp(); s.y.hopp(); s.r.hopp(); }); T.hopp(); // ingen flyging ved lasting midt på siden
  tegn();
  document.fonts && document.fonts.ready.then(function(){ malEtiketter(); tegn(); });
  // liten demonstrasjon ved første besøk: gassliften fjærer én gang, så man ser at stolen kan trykkes (ikke ved redusert bevegelse)
  if(!reduser.matches){ setTimeout(function(){ if(t<0.05 && !holder){ q.v=5; start(); } },900); }
})();
