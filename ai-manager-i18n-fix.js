'use strict';
(()=>{
 const apply=()=>{
  const lang=localStorage.getItem('nara.language')||'ar';
  const labels={ar:{agents:'الوكلاء',manager:'مدير NARA AI'},de:{agents:'Agenten',manager:'NARA KI-Manager'},en:{agents:'Agents',manager:'NARA AI Manager'}};
  const t=labels[lang]||labels.ar;
  const headings=document.querySelectorAll('#ai-manager .card h2');
  if(headings[1])headings[1].textContent=t.agents;
  const links=document.querySelectorAll('#ai-manager .agent-nav a');
  if(links[3])links[3].textContent=t.agents;
  const sideLink=document.querySelector('.side a[data-nav-key="ai-manager"]');
  if(sideLink){sideLink.textContent=t.manager;sideLink.classList.add('current');}
 };
 window.addEventListener('nara-language-changed',apply);
 setTimeout(apply,20);
})();
