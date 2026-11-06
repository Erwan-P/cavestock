"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {ArrowDown,ArrowUp,Plus,Trash2,X} from 'lucide-react';
import type {CellarData} from '@/lib/cellar-types';
import {useDialogFocus} from '@/lib/use-dialog-focus';
export function CategoryManager({data,onUpdated,onClose}:{data:CellarData;onUpdated:(data:CellarData)=>void;onClose:()=>void}){
 const [pending,setPending]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const ref=useRef<HTMLDivElement>(null);useDialogFocus(true,ref,()=>{if(!busy){if(pending)setPending(null);else onClose();}});
 useEffect(()=>{const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};},[]);
 async function action(body: object, endpoint = '/api/cellar/categories') {
   if (busy) return false;
   setBusy(true);
   setError('');
   try {
     const response = await fetch(endpoint, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(body),
     });
     const result = await response.json();
     if (!response.ok) throw new Error(result.error);
     onUpdated(result.data);
     setPending(null);
     return true;
   } catch (error) {
     setError(error instanceof Error ? error.message : 'Modification impossible.');
     return false;
   } finally {
     setBusy(false);
   }
 }

 async function addCategory(event: FormEvent<HTMLFormElement>) {
   event.preventDefault();
   const form = event.currentTarget;
   const name = String(new FormData(form).get('name') ?? '').trim();
   if (await action({ action: 'create-category', category: { name } }, '/api/cellar')) {
     form.reset();
   }
 }

 function reorder(id:string,target:string){if(busy||id===target)return;const ids=data.categories.map(c=>c.id),from=ids.indexOf(id),to=ids.indexOf(target);if(from<0||to<0)return;[ids[from],ids[to]]=[ids[to],ids[from]];void action({action:'reorder',ids});}
 return createPortal(<div className="cellar-overlay feature-overlay"><div ref={ref} className="cellar-dialog cellar-dialog--small category-manager" role="dialog" aria-modal="true" aria-labelledby="categories-title" tabIndex={-1}><button className="cellar-dialog__close" aria-label="Fermer" onClick={onClose} disabled={busy}><X/></button><h2 id="categories-title">Gérer les catégories</h2>{data.categories.map((c,i)=><div className="managed-category" key={c.id}><span>{c.name}</span><button aria-label={`Monter ${c.name}`} disabled={busy||i===0} onClick={()=>reorder(c.id,data.categories[i-1].id)}><ArrowUp size={15}/></button><button aria-label={`Descendre ${c.name}`} disabled={busy||i===data.categories.length-1} onClick={()=>reorder(c.id,data.categories[i+1].id)}><ArrowDown size={15}/></button><button className="category-trash" aria-label={`Supprimer ${c.name}`} disabled={busy} onClick={()=>setPending(c.id)}><Trash2 size={18}/></button></div>)}{!data.categories.length&&<p>Aucune catégorie pour le moment.</p>}{pending&&<div className="category-confirm" role="alert"><strong>{data.categories.find(c=>c.id===pending)?.name}</strong><p>Sûr ? Cette action supprimera aussi les vins de la catégorie</p><button disabled={busy} onClick={()=>setPending(null)}>Annuler</button><button disabled={busy} onClick={()=>action({action:'delete',id:pending})}>{busy?'Suppression…':'Oui, supprimer'}</button></div>}<form onSubmit={addCategory} className="cellar-category-form category-manager__add">
   <label htmlFor="category-manager-name">Ajouter une catégorie</label>
   <input id="category-manager-name" name="name" required minLength={2} maxLength={100} placeholder="Ex. Vins doux" disabled={busy || Boolean(pending)} />
   <button type="submit" className="cellar-pill cellar-pill--save" disabled={busy || Boolean(pending)}><Plus size={18} aria-hidden="true" /> Ajouter</button>
 </form>{error&&<p role="alert" className="cellar-form-error">{error}</p>}</div></div>,document.body);
}
