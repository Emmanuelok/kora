'use client';

/* Native anchors preserve full-page navigation in the current Vinext deployment. */
/* eslint-disable @next/next/no-html-link-for-pages */
/* Catalogue images use their existing source URLs and browser-native lazy loading. */
/* eslint-disable @next/next/no-img-element */

import { useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown, Layers3, Search, X } from 'lucide-react';
import { navigationDepartments } from '../lib/department-navigation';
import './department-directory.css';

const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const featuredDepartments = navigationDepartments.filter(department => ['computers-tablets', 'phones', 'audio'].includes(department.id)).slice(0, 3);
const previewCategories = 3;

function DirectoryPhoto({ src, priority = false }: { src: string; priority?: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <span className="kora-directory-photo" aria-hidden="true">
      {src && failedSource !== src ? (
        <img src={src} alt="" width={360} height={280} loading={priority ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedSource(src)} />
      ) : (
        <Layers3 className="kora-directory-photo-fallback" size={36} strokeWidth={1.25} />
      )}
    </span>
  );
}

export default function DepartmentDirectory() {
  const [query, setQuery] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const directoryId = useId();
  const searchId = `${directoryId}-search`;
  const resultsId = `${directoryId}-results`;
  const normalizedQuery = normalize(query);
  const searching = normalizedQuery.length > 0;
  const matches = useMemo(() => {
    if (!normalizedQuery) return navigationDepartments;
    const terms = normalizedQuery.split(' ');
    return navigationDepartments.flatMap(department => {
      const title = normalize(department.title);
      if (terms.every(term => title.includes(term))) return [department];
      const categories = department.categories.filter(category => {
        const text = `${title} ${normalize(category.name)}`;
        return terms.every(term => text.includes(term));
      });
      return categories.length ? [{ ...department, categories }] : [];
    });
  }, [normalizedQuery]);

  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  function toggleDepartment(id: string) {
    setExpandedDepartments(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="kora-directory" aria-labelledby={`${directoryId}-heading`}>
      <div className="kora-directory-intro">
        <div className="kora-directory-intro-copy">
          <p className="kora-directory-eyebrow">THE KORA DIRECTORY</p>
          <h1 id={`${directoryId}-heading`}>A place for every<br /><em>possibility.</em></h1>
          <p className="kora-directory-intro-description">For your work, your home and everything in between. Start with a department, then find your way to something you love.</p>
          <a className="kora-directory-browse-all" href="/shop">Browse all products <ArrowUpRight size={19} aria-hidden="true" /></a>
        </div>
        <div className="kora-directory-featured" aria-label="Explore featured departments">
          {featuredDepartments.map(department => (
            <a className="kora-directory-featured-card" href={department.href} key={department.id}>
              <DirectoryPhoto src={department.image} priority />
              <span>{department.title}<ArrowUpRight size={17} aria-hidden="true" /></span>
            </a>
          ))}
        </div>
      </div>

      <div className="kora-directory-content">
        <div className="kora-directory-toolbar">
          <div>
            <p className="kora-directory-eyebrow">FIND YOUR STARTING POINT</p>
            <h2>Explore departments</h2>
          </div>
          <div className="kora-directory-search-area">
            <label className="kora-directory-search-label" htmlFor={searchId}>Find a department or category</label>
            <div className="kora-directory-search">
              <Search size={20} aria-hidden="true" />
              <input ref={searchRef} id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try phones, cameras or coffee" aria-controls={resultsId} autoComplete="off" />
              {query && <button type="button" className="kora-directory-clear" onClick={clearSearch} aria-label="Clear department search"><X size={18} aria-hidden="true" /></button>}
            </div>
          </div>
        </div>

        <p className="kora-directory-search-status" role="status" aria-live="polite">
          {searching ? matches.length ? 'Matching departments and categories are shown below.' : 'No matching departments or categories.' : 'Choose a department or explore its categories.'}
        </p>

        <div id={resultsId} className="kora-directory-grid">
          {matches.map(department => {
            const expanded = expandedDepartments.has(department.id);
            const categories = searching || expanded ? department.categories : department.categories.slice(0, previewCategories);
            const categoriesId = `${directoryId}-${department.id}-categories`;
            return (
              <article className="kora-directory-card" key={department.id}>
                <a className="kora-directory-cover" href={department.href} aria-label={`Explore ${department.title}`}>
                  <DirectoryPhoto src={department.image} />
                  <span className="kora-directory-cover-arrow"><ArrowUpRight size={23} aria-hidden="true" /></span>
                </a>
                <div className="kora-directory-card-content">
                  <div className="kora-directory-card-heading">
                    <h3><a href={department.href}>{department.title}</a></h3>
                    <a className="kora-directory-department-link" href={department.href}>Browse department <ArrowRight size={16} aria-hidden="true" /></a>
                  </div>
                  <ul className="kora-directory-categories" id={categoriesId} aria-label={`${department.title} categories`}>
                    {categories.map(category => (
                      <li key={category.name}>
                        <a href={category.href}>
                          <DirectoryPhoto src={category.image} />
                          <span>{category.name}</span>
                          <ArrowUpRight size={16} aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                  {!searching && department.categories.length > previewCategories && (
                    <button className="kora-directory-toggle" type="button" onClick={() => toggleDepartment(department.id)} aria-expanded={expanded} aria-controls={categoriesId} aria-label={`${expanded ? 'Show fewer' : 'Show all'} categories in ${department.title}`}>
                      {expanded ? 'Show fewer categories' : 'Show all categories'}
                      <ChevronDown size={17} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {!matches.length && (
          <div className="kora-directory-empty">
            <span className="kora-directory-empty-icon"><Search size={28} strokeWidth={1.5} aria-hidden="true" /></span>
            <h3>Let’s try another direction.</h3>
            <p>Try a broader word, such as audio, kitchen or gaming. You can also browse the full collection.</p>
            <div><button type="button" onClick={clearSearch}>Clear search <X size={16} aria-hidden="true" /></button><a href="/shop">Browse all products <ArrowRight size={17} aria-hidden="true" /></a></div>
          </div>
        )}
      </div>
    </section>
  );
}
