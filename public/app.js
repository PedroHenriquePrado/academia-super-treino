
(() => {
  const qs=(s,r=document)=>r.querySelector(s), qsa=(s,r=document)=>[...r.querySelectorAll(s)];

  // Modo escuro: usa a preferência do dispositivo até que alguém escolha manualmente.
  const themeStorageKey = 'super-treino-theme';
  const themeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function savedTheme(){
    try { return localStorage.getItem(themeStorageKey); } catch { return null; }
  }
  function paintThemeControls(){
    const dark = document.documentElement.dataset.theme === 'dark';
    qsa('[data-theme-toggle]').forEach(button=>{
      const nextLabel = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
      button.setAttribute('aria-label', nextLabel);
      button.setAttribute('aria-pressed', String(dark));
      button.title = nextLabel;
      const icon=qs('.theme-icon',button), label=qs('.theme-label',button);
      if(icon) icon.textContent=dark ? '☀️' : '🌙';
      if(label) label.textContent=dark ? 'Modo claro' : 'Modo escuro';
    });
    qs('meta[name="theme-color"]')?.setAttribute('content',dark ? '#101827' : '#111827');
  }
  qsa('[data-theme-toggle]').forEach(button=>button.addEventListener('click',()=>{
    const next=document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme=next;
    try { localStorage.setItem(themeStorageKey,next); } catch { /* tema ainda funciona nesta página */ }
    paintThemeControls();
  }));
  themeMedia?.addEventListener?.('change', event=>{
    if(savedTheme() !== 'dark' && savedTheme() !== 'light'){
      document.documentElement.dataset.theme=event.matches ? 'dark' : 'light';
      paintThemeControls();
    }
  });
  paintThemeControls();

  // Melhoria simples: botão para mostrar/ocultar a senha nos formulários existentes.
  qsa('input[type="password"]').forEach(input=>{
    const wrapper=document.createElement('span');
    wrapper.className='password-field';
    input.parentNode.insertBefore(wrapper,input);
    wrapper.appendChild(input);
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='password-toggle';
    toggle.textContent='Mostrar';
    toggle.setAttribute('aria-label','Mostrar senha');
    toggle.setAttribute('aria-pressed','false');
    toggle.addEventListener('click',()=>{
      const visible=input.type==='password';
      input.type=visible ? 'text' : 'password';
      toggle.textContent=visible ? 'Ocultar' : 'Mostrar';
      toggle.setAttribute('aria-label',visible ? 'Ocultar senha' : 'Mostrar senha');
      toggle.setAttribute('aria-pressed',String(visible));
      input.focus();
    });
    wrapper.appendChild(toggle);
  });

  function digits(v){ return String(v||'').replace(/\D/g,''); }
  function maskPhone(v){
    const d=digits(v).slice(0,11);
    if(d.length<=2) return d;
    if(d.length<=6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if(d.length<=10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  }
  function maskCep(v){
    const d=digits(v).slice(0,8);
    return d.length>5 ? `${d.slice(0,5)}-${d.slice(5)}` : d;
  }

  qsa('.phone-mask').forEach(el=>{
    el.value=maskPhone(el.value);
    el.addEventListener('input',()=>el.value=maskPhone(el.value));
  });
  qsa('.cep-mask').forEach(el=>{
    el.value=maskCep(el.value);
    el.addEventListener('input',()=>el.value=maskCep(el.value));
  });

  const plan=qs('#planSelect');
  if(plan){
    plan.addEventListener('change',()=>{
      const opt=plan.selectedOptions[0], input=qs('#monthlyValue');
      if(input && opt?.dataset.value) input.value=Number(opt.dataset.value).toFixed(2);
    });
  }

  // V4.2 — mostra a data prevista sem modificar nenhuma cobrança no banco.
  const studentForm=qs('.student-registration');
  if(studentForm){
    const startInput=qs('input[name="start_date"]',studentForm);
    const dueInput=qs('#dueDay',studentForm);
    const planInput=qs('#planSelect',studentForm);
    const duePreview=qs('#duePreview',studentForm);
    const phoneInput=qs('input[name="phone"]',studentForm);
    const nameInput=qs('input[name="name"]',studentForm);
    const duplicateNotice=qs('#duplicateNotice',studentForm);
    const isExisting=Boolean(studentForm.dataset.studentId);
    const todayStr=studentForm.dataset.today;
    // Quem escolher manualmente o dia mantém a própria escolha ao mudar a data de início.
    let dueEdited=isExisting;
    function lastDay(year,month){return new Date(Date.UTC(year,month,0)).getUTCDate();}
    function renderDuePreview(){
      if(!startInput||!dueInput||!planInput||!duePreview)return;
      const date=startInput.value, day=Number(dueInput.value);
      const planMonths=Math.max(1,Number(planInput.selectedOptions[0]?.dataset.months)||1);
      const output=qs('span',duePreview);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(day)||day<1||day>31){
        output.textContent='Informe uma data de início e um dia entre 1 e 31.';return;
      }
      const [startYear,startMonth]=date.split('-').map(Number);
      const [nowYear,nowMonth]=todayStr.split('-').map(Number);
      let monthIndex=startYear*12+startMonth-1;
      const nowIndex=nowYear*12+nowMonth-1;
      if(monthIndex<nowIndex){
        monthIndex+=Math.max(0,Math.ceil((nowIndex-monthIndex)/planMonths))*planMonths;
      }
      // Até a primeira data de vencimento futura, respeitando o ciclo do plano.
      for(let attempts=0;attempts<3;attempts++){
        const year=Math.floor(monthIndex/12),month=monthIndex%12+1;
        const actualDay=Math.min(day,lastDay(year,month));
        const iso=`${year}-${String(month).padStart(2,'0')}-${String(actualDay).padStart(2,'0')}`;
        if(iso>=todayStr){
          output.textContent=`${String(actualDay).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year} · ${planMonths===1?'mensal':`a cada ${planMonths} meses`}${actualDay!==day?' (ajustado ao último dia do mês)':''}`;
          return;
        }
        monthIndex+=planMonths;
      }
    }
    startInput?.addEventListener('change',()=>{
      if(!dueEdited&&dueInput&&/^\d{4}-\d{2}-\d{2}$/.test(startInput.value)){
        dueInput.value=String(Number(startInput.value.slice(-2)));
      }
      renderDuePreview();
    });
    dueInput?.addEventListener('input',()=>{dueEdited=true;renderDuePreview();});
    planInput?.addEventListener('change',renderDuePreview);
    renderDuePreview();

    // Aviso consultivo: familiares podem ter o mesmo telefone; nunca impede o cadastro.
    let duplicateTimer=0, requestSerial=0;
    let duplicateController=null;
    function verifyDuplicate(){
      clearTimeout(duplicateTimer);
      duplicateController?.abort();
      const current=++requestSerial;
      const phone=digits(phoneInput?.value||'');
      const name=(nameInput?.value||'').trim();
      if(!duplicateNotice)return;
      duplicateNotice.hidden=true;
      duplicateNotice.replaceChildren();
      if(phone.length<10&&name.length<5)return;
      duplicateTimer=setTimeout(async()=>{
        duplicateController=new AbortController();
        try{
          const params=new URLSearchParams({phone,name});
          if(isExisting)params.set('exclude_id',studentForm.dataset.studentId);
          const response=await fetch(`/api/alunos/verificar-duplicidade?${params}`,{
            credentials:'same-origin',signal:duplicateController.signal,cache:'no-store'
          });
          if(!response.ok)throw new Error('Consulta indisponível');
          const result=await response.json();
          if(current!==requestSerial)return;
          const matches=result.matches||[];
          if(!matches.length)return;
          duplicateNotice.hidden=false;
          const headline=document.createElement('strong');
          headline.textContent=matches.length===1?'Possível aluno já cadastrado':'Possíveis alunos já cadastrados';
          duplicateNotice.appendChild(headline);
          const desc=document.createElement('p');
          desc.textContent='Confira antes de salvar. A comparação usa o nome completo; este aviso não bloqueia o cadastro.';
          duplicateNotice.appendChild(desc);
          for(const item of matches){
            const link=document.createElement('a');
            link.href=`/alunos/${Number(item.id)}`;
            link.target='_blank';link.rel='noopener';
            link.textContent=`${item.name} · ${item.reason} · ${item.status==='active'?'Ativo':'Inativo'} — Abrir ficha ↗`;
            duplicateNotice.appendChild(link);
          }
        }catch(err){
          if(err.name!=='AbortError'&&current===requestSerial){
            duplicateNotice.hidden=false;
            duplicateNotice.textContent='Não foi possível verificar duplicidades agora. Confira manualmente antes de salvar.';
          }
        }
      },450);
    }
    phoneInput?.addEventListener('input',verifyDuplicate);
    nameInput?.addEventListener('input',verifyDuplicate);
  }

  async function lookupCep(){
    const cep=qs('#cep'), status=qs('#cepStatus');
    if(!cep) return;
    const d=digits(cep.value);
    if(d.length!==8){ if(status) status.textContent='Digite um CEP com 8 números.'; return; }
    if(status) status.textContent='Buscando endereço...';
    const btn=qs('#buscarCep'); if(btn) btn.disabled=true;
    try{
      const r=await fetch(`https://viacep.com.br/ws/${d}/json/`, {cache:'no-store'});
      if(!r.ok) throw new Error('Falha na consulta');
      const data=await r.json();
      if(data.erro) throw new Error('CEP não encontrado');
      const map={street:data.logradouro||'',neighborhood:data.bairro||'',city:data.localidade||'',state:data.uf||''};
      Object.entries(map).forEach(([id,val])=>{const el=qs(`#${id}`); if(el && val) el.value=val;});
      if(status) status.textContent='Endereço encontrado. Confira o número e o complemento.';
      const number=qs('input[name="number"]'); if(number) number.focus();
    }catch(e){
      if(status) status.textContent='Não foi possível consultar o CEP. Você pode preencher o endereço manualmente.';
    }finally{ if(btn) btn.disabled=false; }
  }
  const cepBtn=qs('#buscarCep'); if(cepBtn) cepBtn.addEventListener('click',lookupCep);
  const cepInput=qs('#cep'); if(cepInput) cepInput.addEventListener('blur',()=>{ if(digits(cepInput.value).length===8) lookupCep(); });

  function imageToDataUrl(file, maxSize=640, quality=.82){
    return new Promise((resolve,reject)=>{
      if(!file) return resolve('');
      if(!file.type.startsWith('image/')) return reject(new Error('Escolha uma imagem.'));
      const reader=new FileReader();
      reader.onload=()=>{
        const img=new Image();
        img.onload=()=>{
          const scale=Math.min(1,maxSize/Math.max(img.width,img.height));
          const canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(img.width*scale));
          canvas.height=Math.max(1,Math.round(img.height*scale));
          const ctx=canvas.getContext('2d');
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/jpeg',quality));
        };
        img.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));
        img.src=reader.result;
      };
      reader.onerror=reject;
      reader.readAsDataURL(file);
    });
  }
  async function handleImage(fileInput, hiddenId, previewId){
    const file=fileInput.files?.[0]; if(!file) return;
    try{
      const data=await imageToDataUrl(file);
      const hidden=qs(`#${hiddenId}`), preview=qs(`#${previewId}`);
      if(hidden) hidden.value=data;
      if(preview){
        if(preview.tagName==='IMG') preview.src=data;
        else preview.innerHTML=`<img src="${data}" alt="">`;
      }
    }catch(e){ alert(e.message); }
  }
  const photoFile=qs('#photoFile'); if(photoFile) photoFile.addEventListener('change',()=>handleImage(photoFile,'photoData','photoPreview'));
  const logoFile=qs('#logoFile'); if(logoFile) logoFile.addEventListener('change',()=>handleImage(logoFile,'logoData','logoPreview'));

  qsa('form[data-confirm]').forEach(form=>form.addEventListener('submit',e=>{
    const msg=form.dataset.confirm||'Confirmar esta ação?';
    if(!confirm(msg)) e.preventDefault();
  }));
  qsa('[data-confirm-button]').forEach(btn=>btn.addEventListener('click',e=>{
    if(!confirm(btn.dataset.confirmButton||'Confirmar?')) e.preventDefault();
  }));

  const rows=qs('#exerciseRows'), add=qs('#addExercise');
  let activeWorkoutBlock='Treino A';
  function refreshExerciseCount(){
    const counter=qs('#exerciseCount');
    if(counter&&rows) counter.textContent=`${qsa('.exercise-row',rows).filter(row=>qs('input[name="exercise"]',row)?.value.trim()).length} exercício(s)`;
  }
  function bindRemove(scope=document){
    qsa('.remove-exercise',scope).forEach(btn=>{
      if(btn.dataset.bound) return;
      btn.dataset.bound='1';
      btn.addEventListener('click',()=>{
        const row=btn.closest('.exercise-row');
        if(qsa('.exercise-row',rows).length<=1){
          qsa('input',row).forEach(i=>{if(i.name==='exercise')i.value='';});
          qs('input[name="workout_label"]',row).value=activeWorkoutBlock;
          refreshExerciseCount();
          return;
        }
        row.remove();
        refreshExerciseCount();
      });
      qs('input[name="exercise"]',btn.closest('.exercise-row'))?.addEventListener('input',refreshExerciseCount);
    });
  }
  function appendExercise(name='', focus=true){
    if(!rows)return;
    const first=qsa('.exercise-row',rows)[0];
    const firstExercise=first&&qs('input[name="exercise"]',first);
    if(firstExercise&&!firstExercise.value.trim()&&qsa('.exercise-row',rows).length===1){
      firstExercise.value=name;
      qs('input[name="workout_label"]',first).value=activeWorkoutBlock;
      refreshExerciseCount();
      if(focus) firstExercise.focus();
      return;
    }
    const el=document.createElement('div');
    el.className='exercise-row';
    el.innerHTML=`<input type="hidden" name="item_id" value=""><span class="drag-handle">⋮⋮</span>
      <label>Bloco<input name="workout_label" value="${activeWorkoutBlock}" placeholder="Treino A"></label>
      <label class="exercise-name">Exercício<input name="exercise" required placeholder="Nome do exercício"></label>
      <label>Séries<input name="sets" value="3" required></label>
      <label>Repetições<input name="reps" value="10–12" required></label>
      <label>Descanso<input name="rest" value="60s"></label>
      <label class="exercise-item-note">Recado do professor <small>Visível para todos os alunos com esta ficha</small><textarea name="exercise_notes" maxlength="500" rows="2" placeholder="Ex.: mantenha o movimento controlado."></textarea></label>
      <label class="exercise-suggested-load">Carga sugerida (opcional)<input name="suggested_load" maxlength="30" placeholder="Ex.: 20 kg / cada lado"></label>
      <button type="button" class="remove-exercise" title="Remover exercício" aria-label="Remover exercício"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 3h4l1 4H9l1-4ZM7 7l1 13h8l1-13M10 11v5m4-5v5"/></svg></button>`;
    rows.appendChild(el);
    const input=qs('input[name="exercise"]',el);
    input.value=name;
    bindRemove(el);
    bindMove(el);
    refreshExerciseCount();
    if(focus) input.focus();
  }
  function bindMove(row){
      if(qs('.exercise-move',row))return;
      const controls=document.createElement('div');controls.className='exercise-move';
      for(const [direction,label] of [['up','Subir exercício'],['down','Descer exercício']]){
        const button=document.createElement('button');button.type='button';button.textContent=direction==='up'?'↑':'↓';button.title=label;
        button.setAttribute('aria-label',label);button.addEventListener('click',()=>{
          const sibling=direction==='up'?row.previousElementSibling:row.nextElementSibling;
          if(!sibling)return;
          if(direction==='up')rows.insertBefore(row,sibling);else rows.insertBefore(sibling,row);
          button.focus();refreshExerciseCount();
        });controls.append(button);
      }
      row.append(controls);
  }
  if(rows && add){
    bindRemove(rows);
    qsa('.exercise-row',rows).forEach(bindMove);
    refreshExerciseCount();
    add.addEventListener('click',()=>appendExercise('',true));

    qsa('[data-workout-block]').forEach(btn=>btn.addEventListener('click',()=>{
      activeWorkoutBlock=btn.dataset.workoutBlock||'Treino A';
      qsa('[data-workout-block]').forEach(b=>b.classList.toggle('active',b===btn));
    }));

    const librarySearch=qs('#exerciseLibrarySearch');
    const libraryItems=qsa('[data-library-exercise]');
    const libraryEmpty=qs('#exerciseLibraryEmpty');
    const favoriteFilter=qs('#exerciseFavoritesOnly');
    const favoriteKey='super-treino-exercise-favorites-v1';
    let favorites=new Set();
    try { const stored=JSON.parse(localStorage.getItem(favoriteKey)||'[]');if(Array.isArray(stored))favorites=new Set(stored.filter(name=>typeof name==='string')); } catch {}
    function syncFavorites(){
      libraryItems.forEach(item=>{
        const button=qs('[data-library-favorite]',item),liked=favorites.has(item.dataset.libraryExercise);
        if(button){button.textContent=liked?'★':'☆';button.setAttribute('aria-pressed',String(liked));button.setAttribute('aria-label',`${liked?'Desfavoritar':'Favoritar'} ${item.dataset.libraryExercise}`)}
      });
    }
    let activeCategory='Todos';
    function filterExerciseLibrary(){
      const term=(librarySearch?.value||'').trim().toLocaleLowerCase('pt-BR');
      let visible=0;
      libraryItems.forEach(item=>{
        const matchesCategory=activeCategory==='Todos'||item.dataset.libraryCategory===activeCategory;
        const matchesText=!term||item.dataset.libraryExercise.toLocaleLowerCase('pt-BR').includes(term)||item.dataset.libraryCategory.toLocaleLowerCase('pt-BR').includes(term);
        const show=matchesCategory&&matchesText&&(!favoriteFilter?.checked||favorites.has(item.dataset.libraryExercise));
        item.hidden=!show;
        if(show)visible++;
      });
      if(libraryEmpty) libraryEmpty.hidden=visible!==0;
    }
    libraryItems.forEach(item=>qs('[data-library-add]',item)?.addEventListener('click',()=>appendExercise(item.dataset.libraryExercise||'',false)));
    libraryItems.forEach(item=>qs('[data-library-favorite]',item)?.addEventListener('click',()=>{
      const name=item.dataset.libraryExercise;
      if(favorites.has(name))favorites.delete(name);else favorites.add(name);
      try {localStorage.setItem(favoriteKey,JSON.stringify([...favorites]))}catch{}
      syncFavorites();filterExerciseLibrary();
    }));
    syncFavorites();
    favoriteFilter?.addEventListener('change',filterExerciseLibrary);
    librarySearch?.addEventListener('input',filterExerciseLibrary);
    qsa('[data-exercise-category]').forEach(btn=>btn.addEventListener('click',()=>{
      activeCategory=btn.dataset.exerciseCategory||'Todos';
      qsa('[data-exercise-category]').forEach(b=>b.classList.toggle('active',b===btn));
      filterExerciseLibrary();
    }));
  }

  // Guia independente do botão de adicionar; mídia somente após abrir.
  const demoDialog=qs('#exerciseDemoDialog');
  function coverMarkup(name,category){
    const short={Pernas:'PER',Costas:'COS',Peito:'PEI',Ombros:'OMB',Braços:'BRA',Core:'CORE'}[category]||'TREINO';
    const cover=document.createElement('div');cover.className='exercise-cover';cover.dataset.coverCategory=category;
    cover.setAttribute('role','img');cover.setAttribute('aria-label',`Capa gráfica: ${name}`);
    const orbit=document.createElement('span');orbit.className='exercise-cover-orbit';orbit.setAttribute('aria-hidden','true');cover.append(orbit);
    const mark=document.createElement('span');mark.className='exercise-cover-mark';mark.textContent=`ST · ${short}`;cover.append(mark);
    const title=document.createElement('strong');title.textContent=name;cover.append(title);
    const caption=document.createElement('small');caption.textContent='GUIA DE MOVIMENTO';cover.append(caption);
    return cover;
  }
  function stopVideo(container){
    qsa('video',container).forEach(video=>{video.pause();video.removeAttribute('src');video.load()});
  }
  qsa('[data-preview-steps]').forEach(btn=>btn.addEventListener('click',()=>{
    if(!demoDialog)return;
    const name=btn.dataset.previewName||'Exercício',category=btn.dataset.previewCategory||'Treino';
    qs('#exerciseDemoTitle',demoDialog).textContent=name;
    const media=qs('#exerciseDemoMedia',demoDialog), instructions=qs('#exerciseDemoInstructions',demoDialog);
    stopVideo(media);media.replaceChildren();instructions.replaceChildren();
    if(btn.dataset.previewVideo){
      const video=document.createElement('video');video.className='exercise-video';video.controls=true;
      video.muted=true;video.loop=true;video.playsInline=true;video.preload='none';
      video.setAttribute('aria-label',`Demonstração de ${name}`);video.src=btn.dataset.previewVideo;media.append(video);
    } else {
      media.append(coverMarkup(name,category));
      const note=document.createElement('p');note.className='exercise-media-caption';
      note.textContent='Demonstração em vídeo em preparação. Peça ao professor para mostrar a execução.';media.append(note);
    }
    const heading=document.createElement('strong');heading.textContent='Como fazer';instructions.append(heading);
    const list=document.createElement('ol');list.className='exercise-steps';
    let steps=[];try{steps=JSON.parse(btn.dataset.previewSteps||'[]')}catch{}
    steps.forEach((step,i)=>{
      const item=document.createElement('li'),num=document.createElement('span');
      num.textContent=String(i+1).padStart(2,'0');item.append(num,document.createTextNode(step));list.append(item);
    });instructions.append(list);
    if(btn.dataset.previewYoutube){
      const link=document.createElement('a');link.className='exercise-youtube-link';link.href=btn.dataset.previewYoutube;
      link.target='_blank';link.rel='noopener noreferrer';link.textContent='▶ Pesquisar execução no YouTube ↗';
      instructions.append(link);
      const hint=document.createElement('small');hint.className='exercise-youtube-hint';
      hint.textContent='O YouTube mostra resultados de busca. Confirme a execução com o professor.';
      instructions.append(hint);
    }
    if(typeof demoDialog.showModal==='function')demoDialog.showModal();
    else demoDialog.setAttribute('open','');
  }));
  function closeGuide(){stopVideo(qs('#exerciseDemoMedia',demoDialog));if(typeof demoDialog.close==='function')demoDialog.close();else demoDialog.removeAttribute('open')}
  demoDialog?.querySelector('[data-preview-close]')?.addEventListener('click',closeGuide);
  demoDialog?.addEventListener('close',()=>stopVideo(qs('#exerciseDemoMedia',demoDialog)));
  demoDialog?.addEventListener('click',e=>{if(e.target===demoDialog)closeGuide()});
  qsa('.portal-demo-details').forEach(details=>details.addEventListener('toggle',()=>{
    const video=qs('[data-video-src]',details);if(!video)return;
    if(details.open){video.src=video.dataset.videoSrc;video.play().catch(()=>{})}
    else stopVideo(details);
  }));

  // Cronômetro local: continua correto se o celular suspender a aba.
  const timer=qs('.focus-timer');
  if(timer){
    const start=qs('[data-rest-start]',timer),reset=qs('[data-rest-reset]',timer),clock=qs('[data-rest-clock]',timer);
    const seconds=Math.max(1,Math.min(600,Number(timer.dataset.restSeconds)||60));
    let until=0,interval=null;
    function refresh(){
      const remaining=Math.max(0,Math.ceil((until-Date.now())/1000));
      clock.textContent=remaining?`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:'Descanso concluído ✓';
      if(!remaining){clearInterval(interval);interval=null;start.disabled=false;}
    }
    start?.addEventListener('click',()=>{clearInterval(interval);until=Date.now()+seconds*1000;start.disabled=true;refresh();interval=setInterval(refresh,500)});
    reset?.addEventListener('click',()=>{clearInterval(interval);interval=null;until=0;start.disabled=false;clock.textContent=`${seconds}s`});
  }

  document.addEventListener('click',e=>{
    if(document.body.classList.contains('menu-open') && !e.target.closest('.sidebar') && !e.target.closest('.menu-btn')){
      document.body.classList.remove('menu-open');
    }
  });

  // Instalação do portal. Nunca armazena HTML autenticado ou dados do aluno.
  if(location.pathname==='/app'||location.pathname.startsWith('/app/')){
    if('serviceWorker' in navigator && window.isSecureContext){
      navigator.serviceWorker.register('/sw.js',{scope:'/app'}).catch(()=>{});
    }
    let installPrompt=null;
    const installButton=qs('[data-install-app]');
    const standalone=window.matchMedia?.('(display-mode: standalone)').matches;
    window.addEventListener('beforeinstallprompt',event=>{
      if(standalone)return;
      event.preventDefault();installPrompt=event;
      if(installButton)installButton.hidden=false;
    });
    installButton?.addEventListener('click',async()=>{
      if(!installPrompt)return;
      const prompt=installPrompt;installPrompt=null;installButton.hidden=true;
      await prompt.prompt();
    });
    window.addEventListener('appinstalled',()=>{installPrompt=null;if(installButton)installButton.hidden=true});
  }

  // No celular, também fecha o menu com Escape ou ao escolher uma seção.
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape') document.body.classList.remove('menu-open');
  });
  qsa('.sidebar nav a').forEach(link=>link.addEventListener('click',()=>{
    document.body.classList.remove('menu-open');
  }));

  // Auto-dismiss notices.
  qsa('.toast').forEach(t=>setTimeout(()=>{t.style.opacity='0';t.style.transition='.3s';setTimeout(()=>t.remove(),320)},4200));
})();
