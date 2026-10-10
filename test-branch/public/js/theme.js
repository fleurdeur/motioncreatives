// Runs in <head> before the page paints so a saved theme never flashes.
(function(){try{var r=document.documentElement,t=localStorage.getItem('sa-theme'),f=localStorage.getItem('sa-fx');if(t)r.dataset.theme=t;if(f)r.dataset.fx=f;var m=document.querySelector('meta[name=theme-color]');if(m&&t==='light')m.content='#f6f4fa'}catch(e){}})();
