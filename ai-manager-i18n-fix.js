'use strict';
(()=>{
 const apply=()=>{
  const lang=localStorage.getItem('nara.language')||'ar';
  const labels={ar:{agents:'الوكلاء',manager:'مدير Flamo الذكي',state:'حالة المشروع الفعلية'},de:{agents:'Agenten',manager:'Flamo KI-Manager',state:'Aktueller Projektstatus'},en:{agents:'Agents',manager:'Flamo AI Manager',state:'Current project state'}};
  const t=labels[lang]||labels.ar;
  // العناوين حسب المحتوى مش حسب الترتيب (الترتيب تغيّر لما انضافت بطاقات جديدة)
  const agentsCard=[...document.querySelectorAll('#ai-manager .card')].find(c=>c.querySelector('.agent-grid'));
  const agentsH=agentsCard&&agentsCard.querySelector('h2');if(agentsH)agentsH.textContent=t.agents;
  const stateH=document.querySelector('#manager-project-state h2');if(stateH)stateH.textContent=t.state;
  const links=document.querySelectorAll('#ai-manager .agent-nav a');
  if(links[3])links[3].textContent=t.agents;
  const sideLink=document.querySelector('.side a[data-nav-key="ai-manager"]');
  if(sideLink){sideLink.textContent=t.manager;sideLink.classList.add('current');}
 };
 window.addEventListener('nara-language-changed',apply);
 setTimeout(apply,20);
})();
