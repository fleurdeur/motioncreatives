// Star maker
function starShape(o){
  return `  <shape id="${rid()}" label="Star ${o.i}" startTime="0" endTime="${n('cd')}" fillType="color" mediaFillMode="fill">
    <transform>
      <location value="${f6(o.x)},${f6(o.y)},0.000000" />
    </transform>
    <fillColor value="${o.color}" />
    <path-stroke direction="centered" end-size="${f6(o.stroke)}" />
    <property name="pointCount" type="float" value="${f6(o.pts)}" />
    <property name="outerRadius" type="float" value="${f6(o.outer)}" />
    <property name="innerRadius" type="float" value="${f6(o.inner)}" />
    <property name="offsetAngle" type="float" value="${f6(o.rot)}" />
  </shape>\n`;
}

$('#sgo').onclick=()=>{
  const cnt=Math.max(1,Math.min(200,n('sn'))), cols=Math.ceil(Math.sqrt(cnt)), rows=Math.ceil(cnt/cols);
  const step=n('so')*2+n('sg'), W=n('cw'), H=n('ch');
  const color=toAM(v('sc'),n('sop'));
  let body='';
  for(let i=0;i<cnt;i++){
    const c=i%cols, r=Math.floor(i/cols);
    body += starShape({ i:i+1, x:W/2+(c-(cols-1)/2)*step, y:H/2+(r-(rows-1)/2)*step, color, stroke:n('ss'), pts:n('sp'), outer:n('so'), inner:n('si'), rot:n('sa') });
  }
  $('#sout').value = wrapScene(body);
};

$('#sgo').addEventListener('click',()=>{ if(v('sout').trim()) markMade(); });
