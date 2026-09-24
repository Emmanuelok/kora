'use client';

/* Native anchors preserve navigation in the current Vinext deployment; images use existing source URLs. */
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers3, ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, Menu, Search, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { navigationDepartments } from '@/lib/department-navigation';
import './department-menu.css';

const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function MenuImage({ src }: { src: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return <span className="explore-image" aria-hidden="true">{src && failedSource !== src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSource(src)}/> : <Layers3 size={24} strokeWidth={1.2}/>}</span>;
}

export default function DepartmentMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(navigationDepartments[0]?.id || '');
  const [showCategories, setShowCategories] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const categoryTitleRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const departmentButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const previousView = useRef(false);
  const active = navigationDepartments.find(department => department.id === activeId) || navigationDepartments[0];
  const searching = normalize(query).length > 0;
  const results = useMemo(() => {
    const tokens = normalize(query).split(' ').filter(Boolean);
    const matches = (value: string) => tokens.every(token => normalize(value).includes(token));
    return {
      departments: tokens.length ? navigationDepartments.filter(department => matches(department.title)) : [],
      categories: tokens.length ? navigationDepartments.flatMap(department => department.categories.filter(category => matches(category.name + ' ' + department.title)).map(category => ({ ...category, department: department.title }))) : [],
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    if (showCategories) categoryTitleRef.current?.focus();
    else if (previousView.current) departmentButtons.current[activeId]?.focus();
    previousView.current = showCategories;
  }, [activeId, open, showCategories, searching]);

  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) { setQuery(''); setShowCategories(false); previousView.current = false; }
  }
  function selectDepartment(id: string) {
    setActiveId(id); setQuery(''); setShowCategories(true);
  }
  function clearSearch() { setQuery(''); searchRef.current?.focus(); }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><button className={'all-departments ' + (open ? 'active' : '')}><Menu size={20}/> All departments <ChevronDown size={15}/></button></DialogTrigger>
    <DialogContent className="explore-menu" showCloseButton={false} onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}>
      <header className="explore-header">
        <div><p className="explore-kicker">FIND YOUR NEXT FAVOURITE</p><DialogTitle ref={titleRef} tabIndex={-1}>Explore Kora.</DialogTitle><DialogDescription>Good finds, just around the corner.</DialogDescription></div>
        <DialogClose asChild><button className="explore-close" aria-label="Close departments"><X size={22}/></button></DialogClose>
      </header>
      <div className="explore-search"><Search size={19}/><input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search departments and categories" placeholder="Try headphones, kitchen or gaming" autoComplete="off"/>{query && <button onClick={clearSearch} aria-label="Clear department search"><X size={17}/></button>}</div>
      <p className="sr-only" role="status">{searching ? results.departments.length || results.categories.length ? 'Matching departments and categories are shown below.' : 'No matching departments or categories.' : ''}</p>
      {searching ? <div className="explore-results" key="search" role="region" aria-label="Department search results">
        {results.departments.length > 0 && <section><h3>Departments</h3><div className="explore-result-departments">{results.departments.map(department => <button key={department.id} onClick={() => selectDepartment(department.id)}><MenuImage src={department.image}/><span>{department.title}</span><ChevronRight size={16}/></button>)}</div></section>}
        {results.categories.length > 0 && <section><h3>Explore categories</h3><div className="explore-category-grid">{results.categories.map(category => <a key={category.href} href={category.href}><MenuImage src={category.image}/><span><strong>{category.name}</strong><small>{category.department}</small></span><ArrowUpRight size={16}/></a>)}</div></section>}
        {!results.departments.length && !results.categories.length && <div className="explore-no-results"><Search size={30}/><h3>Let’s look a little wider.</h3><p>Try a different department or category, or search the products themselves.</p><a href={'/shop?q=' + encodeURIComponent(query.trim())}>Search products <ArrowRight size={17}/></a><button onClick={() => { setShowCategories(false); clearSearch(); }}>Browse all departments</button></div>}
      </div> : <div className={'explore-body' + (showCategories ? ' showing-categories' : '')}>
        <div className="explore-departments" role="region" aria-label="Departments">
          <p className="explore-list-label">What are you looking for?</p>
          {navigationDepartments.map((department, index) => <button key={department.id} ref={element => { departmentButtons.current[department.id] = element; }} className={department.id === activeId ? 'is-active' : ''} aria-pressed={department.id === activeId} aria-controls="explore-categories" onClick={() => selectDepartment(department.id)} onKeyDown={event => {
            const next = event.key === 'ArrowDown' ? Math.min(index + 1, navigationDepartments.length - 1) : event.key === 'ArrowUp' ? Math.max(index - 1, 0) : event.key === 'Home' ? 0 : event.key === 'End' ? navigationDepartments.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); departmentButtons.current[navigationDepartments[next].id]?.focus(); }
          }}><MenuImage src={department.image}/><span>{department.title}</span><ChevronRight size={16}/></button>)}
        </div>
        {active && <section className="explore-categories" id="explore-categories" key={active.id} aria-label={active.title + ' categories'}>
          <div className="explore-category-heading"><button className="explore-back" onClick={() => setShowCategories(false)}><ArrowLeft size={17}/> All departments</button><div className="explore-department-intro"><MenuImage src={active.image}/><div><p className="explore-kicker">YOUR WORLD, UPGRADED</p><h3 ref={categoryTitleRef} tabIndex={-1}>{active.title}</h3><a href={active.href}>Explore the department <ArrowRight size={16}/></a></div></div></div>
          <div className="explore-category-scroll"><p className="explore-list-label">Find your kind of favourite</p><div className="explore-category-grid">{active.categories.map(category => <a key={category.href} href={category.href}><MenuImage src={category.image}/><span><strong>{category.name}</strong></span><ArrowUpRight size={16}/></a>)}</div></div>
        </section>}
      </div>}
      <footer className="explore-footer"><a href="/departments">Discover every department <ArrowUpRight size={16}/></a><a href="/shop">Shop all <ArrowRight size={16}/></a></footer>
    </DialogContent>
  </Dialog>;
}
