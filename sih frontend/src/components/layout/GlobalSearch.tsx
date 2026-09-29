import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Search, MapPin, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects.api';
import { cn } from '@/lib/utils';
import { RiskLevel } from '@/types';

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects,
    staleTime: 60_000,
  });

  const results = query.length > 1
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.code.toLowerCase().includes(query.toLowerCase()) ||
        p.state.toLowerCase().includes(query.toLowerCase()) ||
        p.district.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleSelect = (id: string) => {
    setIsOpen(false);
    setQuery('');
    navigate(`/projects/${id}`);
  };

  const getRiskColor = (risk: RiskLevel) => {
    switch (risk) {
      case RiskLevel.LOW: return 'bg-risk-low text-white';
      case RiskLevel.MEDIUM: return 'bg-risk-medium text-white';
      case RiskLevel.HIGH: return 'bg-risk-high text-white';
      case RiskLevel.CRITICAL: return 'bg-risk-critical text-white';
      default: return 'bg-gray-200 text-gray-800';
    }
  };

  return (
    <div className="relative w-full max-w-md mx-auto" ref={wrapperRef}>
      <div 
        className={cn(
          "relative flex items-center w-full h-9 rounded-md border border-gray-300 bg-gray-50 overflow-hidden transition-colors focus-within:border-brand-accent focus-within:ring-1 focus-within:ring-brand-accent focus-within:bg-white",
          isOpen && "rounded-b-none border-b-transparent"
        )}
      >
        <div className="pl-3 pr-2 flex items-center justify-center text-gray-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          ref={inputRef}
          type="text"
          className="flex-1 h-full bg-transparent border-none outline-none text-sm text-gray-900 placeholder:text-gray-400"
          placeholder="Search projects by name, code, state..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {query && (
          <button 
            onClick={() => setQuery('')}
            className="px-2 text-gray-400 hover:text-gray-600 focus:outline-none"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="hidden sm:flex items-center px-2 border-l border-gray-200">
          <kbd className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 font-sans">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </div>

      {/* Dropdown Panel */}
      {isOpen && query.length > 1 && (
        <div className="absolute left-0 right-0 top-full z-[60] max-h-96 overflow-y-auto overflow-hidden rounded-b-md border border-gray-200 bg-white shadow-lg">
          {results.length > 0 ? (
            <ul className="py-2">
              {results.map((project) => (
                <li key={project.id}>
                  <button
                    onClick={() => handleSelect(project.id)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-start gap-3 transition-colors"
                  >
                    <div className="mt-0.5 w-8 h-8 rounded bg-brand-navy/5 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-brand-primary">{project.code.split('-')[1] || 'PRJ'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-900 truncate">{project.name}</span>
                        <span className={cn("inline-flex text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ml-2", getRiskColor(project.riskLevel))}>
                          {project.riskLevel}
                        </span>
                      </div>
                      <div className="flex items-center text-xs text-gray-500 mt-1 gap-2">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {project.district}, {project.state}</span>
                        <span>&bull;</span>
                        <span>{project.sector}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No projects found matching "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
