(() => {
    const controls=document.getElementById('history-controls'),help=document.getElementById('history-help'),tooltip=document.getElementById('history-tooltip');
    let hovered=false,focused=false,pinned=false,dismissed=false;
    function update() {
        const open=!dismissed&&(hovered||focused||pinned);
        tooltip.hidden=!open;help.setAttribute('aria-expanded',String(open));
    }
    function dismiss() {pinned=false;dismissed=true;update();}
    controls.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;hovered=true;dismissed=false;update();});
    controls.addEventListener('pointerleave',()=>{hovered=false;update();});
    controls.addEventListener('focusin',()=>{focused=true;dismissed=false;update();});
    controls.addEventListener('focusout',event=>{if(event.relatedTarget&&controls.contains(event.relatedTarget))return;focused=false;update();});
    help.addEventListener('click',()=>{pinned=!pinned;dismissed=!pinned;update();});
    controls.addEventListener('keydown',event=>{if(event.key==='Escape'){dismiss();event.preventDefault();event.stopPropagation();}});
    // The toolbar shares the plot's stacking context, but never starts a canvas gesture.
    for(const type of ['pointerdown','wheel'])controls.addEventListener(type,event=>event.stopPropagation());
    document.addEventListener('pointerdown',event=>{if(!controls.contains?.(event.target))dismiss();});
    window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!tooltip.hidden)dismiss();});
    update();
})();
