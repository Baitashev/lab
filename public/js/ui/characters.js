/** Персонажи и аватары игроков — рисуются SVG-кодом, без картинок. */
import { raw } from "./dom.js";

export const PEOPLE = {
  mentor:{name:"Бакыт Асанович",role:"руководитель лаборатории",skin:"#E0B48F",hair:"#B9BEC2",style:"bald",outfit:"#F3F5F6",shirt:"#3E6A8A",glasses:true,bg:"#CFE0EA",coat:true},
  inv:{name:"Айгерим Садыкова",role:"следователь",skin:"#E6BE98",hair:"#1F1A17",style:"bun",outfit:"#24405E",shirt:"#E8EEF3",badge:true,bg:"#F6E3A6"},
  judge:{name:"Нурлан Мамбетов",role:"судья",skin:"#D5A57D",hair:"#2B2420",style:"short",outfit:"#1E1E22",shirt:"#FFFFFF",jabot:true,bg:"#E3D6EA"},
  crim:{name:"Данияр Осмонов",role:"специалист-криминалист",skin:"#C99671",hair:"#2A2018",style:"cap",cap:"#1F5F5C",outfit:"#2F7D7A",shirt:"#DDEFEA",bg:"#D4EBDD"},
  insp:{name:"Эрмек Жумабаев",role:"инспектор патрульной службы",skin:"#D9AC86",hair:"#231C17",style:"cap",cap:"#22395E",outfit:"#3C5E8E",shirt:"#C9D8EA",badge:true,bg:"#DDE6F5"},
  kanat:{name:"Канат",role:"одногруппник",skin:"#E3B995",hair:"#5A3A22",style:"short",outfit:"#C2553A",shirt:"#F0D4C8",bg:"#F5DCD3"},
  adv:{name:"Тимур Исаков",role:"адвокат",skin:"#DDB08A",hair:"#1E1814",style:"short",outfit:"#3A3F55",shirt:"#F2F2F2",glasses:true,bg:"#DCDFEA"},
  aipery:{name:"Айпери Токтосунова",role:"эксперт-почерковед",skin:"#E9C29E",hair:"#2A1D17",style:"long",outfit:"#F3F5F6",shirt:"#B85C6E",coat:true,bg:"#F3E0D6"},
  prosecutor:{name:"Сарбанова Салима Санджаровна",role:"прокурор",skin:"#DDB08F",hair:"#20160F",style:"bun",outfit:"#1E3557",shirt:"#F2F4F7",badge:true,epaulets:true,bg:"#D6DFEC"},
  gulzat:{name:"Гулзат эже",role:"соседка",skin:"#D8A882",hair:"#3B2A22",style:"long",outfit:"#7A4E8C",shirt:"#EAD8F0",bg:"#F0DDE8"}
};
export const AVATARS = [
  {skin:"#E6BE98",hair:"#1F1A17",style:"long",outfit:"#2F6F9F",shirt:"#DCEAF5",bg:"#D7E8F2"},
  {skin:"#D9AC86",hair:"#2A2018",style:"short",outfit:"#4F6B3A",shirt:"#E3EDD8",bg:"#E2EDD3"},
  {skin:"#E8C3A0",hair:"#6B3E22",style:"bun",outfit:"#9C3D54",shirt:"#F3DCE2",bg:"#F4DDE3"},
  {skin:"#C99671",hair:"#151210",style:"short",outfit:"#33363B",shirt:"#E6E6E6",glasses:true,bg:"#E5E1D6"},
  {skin:"#E0B48F",hair:"#2B2420",style:"long",outfit:"#B07A1E",shirt:"#F6E8C8",glasses:true,bg:"#F5E7C4"},
  {skin:"#D5A57D",hair:"#3B2A22",style:"cap",cap:"#6A3D9A",outfit:"#5A4C8C",shirt:"#E2DDF2",bg:"#E1DCF0"},
  {skin:"#C48E68",hair:"#1A1411",style:"bun",outfit:"#1F6F6A",shirt:"#D6EDEA",glasses:true,bg:"#D3ECE6"},
  {skin:"#EAC6A2",hair:"#7A4A26",style:"short",outfit:"#8C3B2E",shirt:"#F4DCD5",bg:"#F6E1D8"}
];

let PID = 0;
function portraitSvg(p, mood="neutral"){
  const cid="cp"+(++PID);
  const hairBack = p.style==="long"
    ? `<path d="M28 46C26 24 40 17 50 17C62 17 75 24 72 46L75 74H61L64 44H36L39 74H25Z" fill="${p.hair}"/>` : "";
  let hairTop = "";
  if(p.style==="short") hairTop=`<path d="M30 44C29 26 40 20 50 20C62 20 72 27 70 44C68 34 60 30 50 31C40 31 33 35 30 44Z" fill="${p.hair}"/>`;
  if(p.style==="bun") hairTop=`<circle cx="50" cy="19" r="8" fill="${p.hair}"/><path d="M31 46C28 28 40 23 50 23C61 23 72 28 69 46C66 33 58 31 50 31C42 31 34 34 31 46Z" fill="${p.hair}"/>`;
  if(p.style==="long") hairTop=`<path d="M30 44C29 26 40 20 50 20C62 20 72 27 70 44C64 32 56 30 48 31C40 32 34 36 30 44Z" fill="${p.hair}"/>`;
  if(p.style==="bald") hairTop=`<path d="M31 50C29 41 31 35 35 32L36 50Z" fill="${p.hair}"/><path d="M69 50C71 41 69 35 65 32L64 50Z" fill="${p.hair}"/>`;
  if(p.style==="cap") hairTop=`<path d="M31 44C31 38 33 35 35 34L35 46Z" fill="${p.hair}"/><path d="M29 38C29 21 71 21 71 38Z" fill="${p.cap}"/><path d="M50 35L82 37L74 41L50 40Z" fill="${p.cap}"/><circle cx="50" cy="29" r="2.2" fill="#E9B824"/>`;
  const mouth = mood==="happy" ? `<path d="M42.5 55.5Q50 63 57.5 55.5" fill="none" stroke="#5A2A1E" stroke-width="2.2" stroke-linecap="round"/>`
    : mood==="sad" ? `<path d="M43.5 59.5Q50 54.5 56.5 59.5" fill="none" stroke="#5A2A1E" stroke-width="2.2" stroke-linecap="round"/>`
    : `<path d="M44.5 57.5H55.5" stroke="#5A2A1E" stroke-width="2.2" stroke-linecap="round"/>`;
  const brows = mood==="sad"
    ? `<path d="M39.5 40.5L46 39M60.5 40.5L54 39" stroke="${p.style==='bald'?p.hair:'#2a221d'}" stroke-width="2" stroke-linecap="round"/>`
    : `<path d="M39.5 39.5L46 38.5M60.5 39.5L54 38.5" stroke="${p.style==='bald'?p.hair:'#2a221d'}" stroke-width="2" stroke-linecap="round"/>`;
  const glasses = p.glasses ? `<g fill="none" stroke="#2c3a46" stroke-width="1.6"><rect x="37" y="42" width="11" height="8" rx="3"/><rect x="52" y="42" width="11" height="8" rx="3"/><path d="M48 46H52"/></g>` : "";
  const coat = p.coat ? `<path d="M50 71L40 100M50 71L60 100" stroke="#C9D1D6" stroke-width="1.4"/>` : "";
  const collar = `<path d="M42 70L50 84L58 70Z" fill="${p.shirt}"/>`;
  const jabot = p.jabot ? `<path d="M45 72H55L53 88H47Z" fill="#FFFFFF"/><path d="M47 76H53M47.5 80H52.5" stroke="#d6d6d6"/>` : "";
  const epaulets = p.epaulets ? `<g fill="#D9A82B"><rect x="17" y="78" width="15" height="4.5" rx="1.5" transform="rotate(-24 24 80)"/><rect x="68" y="78" width="15" height="4.5" rx="1.5" transform="rotate(24 76 80)"/></g>` : "";
  const badge = p.badge ? `<path d="M66 82L70 80L74 82L73 88L70 90L67 88Z" fill="#E9B824"/>` : "";
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${p.name||'Аватар'}" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="${cid}"><circle cx="50" cy="50" r="50"/></clipPath></defs>
    <g clip-path="url(#${cid})">
      <circle cx="50" cy="50" r="50" fill="${p.bg}"/>
      ${hairBack}
      <path d="M12 102C14 79 31 69 50 69C69 69 86 79 88 102Z" fill="${p.outfit}"/>
      ${collar}${jabot}${coat}${epaulets}${badge}
      <rect x="44" y="57" width="12" height="15" rx="5" fill="${p.skin}"/>
      <ellipse cx="50" cy="45" rx="19" ry="21" fill="${p.skin}"/>
      <ellipse cx="31.5" cy="47" rx="3" ry="4.5" fill="${p.skin}"/><ellipse cx="68.5" cy="47" rx="3" ry="4.5" fill="${p.skin}"/>
      ${hairTop}
      ${brows}
      <circle cx="42.5" cy="46" r="2.3" fill="#1b1b1b"/><circle cx="57.5" cy="46" r="2.3" fill="#1b1b1b"/>
      <circle cx="39" cy="53" r="2.6" fill="#E58C7A" opacity=".28"/><circle cx="61" cy="53" r="2.6" fill="#E58C7A" opacity=".28"/>
      ${glasses}${mouth}
    </g></svg>`;
}

export const portrait = (p, mood = "neutral") => raw(portraitSvg(p || AVATARS[0], mood));
export const avatar = (i, mood) => portrait(AVATARS[i] || AVATARS[0], mood);
