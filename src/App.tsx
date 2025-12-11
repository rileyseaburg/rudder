'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  TransitionChild,
} from '@headlessui/react';
import {
  Cog6ToothIcon,
  ServerIcon,
  XMarkIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  FunnelIcon,
  ChevronUpDownIcon,
} from '@heroicons/react/24/outline';
import { Bars3Icon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import ReleaseEditor from './ReleaseEditor';
import KubeconfigPaste from './KubeconfigPaste';
import ContextSwitcher from './ContextSwitcher';

type SortField = 'name' | 'namespace' | 'status' | 'updated';
type SortDirection = 'asc' | 'desc';

interface HelmRelease {
  name: string;
  namespace: string;
  revision: string;
  updated: string;
  status: string;
  chart: string;
  app_version: string;
}

const navigation = [
  { name: 'Releases', href: '#', icon: ServerIcon, current: true },
  { name: 'Settings', href: '#', icon: Cog6ToothIcon, current: false },
];

const statuses = {
  deployed: 'text-green-500 bg-green-500/10 dark:text-green-400 dark:bg-green-400/10',
  failed: 'text-rose-500 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-400/10',
  pending: 'text-gray-400 bg-gray-100 dark:text-gray-500 dark:bg-gray-100/10',
};

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helmData, setHelmData] = useState<HelmRelease[]>([]);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRelease, setSelectedRelease] = useState<HelmRelease | null>(null);
  const [showKubeconfig, setShowKubeconfig] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedNamespace, setSelectedNamespace] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Extract unique namespaces for filtering
  const namespaces = useMemo(() => {
    const ns = [...new Set(helmData.map((r) => r.namespace))].sort();
    return ['all', ...ns];
  }, [helmData]);

  // Filter releases based on search query and namespace
  const filteredReleases = useMemo(() => {
    return helmData.filter((release) => {
      // Namespace filter
      if (selectedNamespace !== 'all' && release.namespace !== selectedNamespace) {
        return false;
      }
      // Search filter
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        release.name.toLowerCase().includes(query) ||
        release.namespace.toLowerCase().includes(query) ||
        release.chart.toLowerCase().includes(query) ||
        release.status.toLowerCase().includes(query)
      );
    });
  }, [helmData, searchQuery, selectedNamespace]);

  // Sort filtered releases
  const sortedReleases = useMemo(() => {
    return [...filteredReleases].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'namespace':
          comparison = a.namespace.localeCompare(b.namespace);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'updated':
          comparison = new Date(a.updated).getTime() - new Date(b.updated).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredReleases, sortField, sortDirection]);

  // Enhanced statistics
  const stats = useMemo(() => ({
    total: helmData.length,
    deployed: helmData.filter((r) => r.status === 'deployed').length,
    failed: helmData.filter((r) => r.status === 'failed').length,
    pending: helmData.filter((r) => r.status.includes('pending')).length,
    namespaces: new Set(helmData.map((r) => r.namespace)).size,
    uniqueCharts: new Set(helmData.map((r) => r.chart.replace(/-\d+\.\d+\.\d+$/, ''))).size,
  }), [helmData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to clear search and blur
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
      // Ctrl+R or Cmd+R to refresh (prevent browser refresh)
      if ((e.ctrlKey || e.metaKey) && e.key === 'r' && !e.shiftKey) {
        e.preventDefault();
        getReleases();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getReleases = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await invoke<string>('list_helm_releases');
      const releases = JSON.parse(result) as HelmRelease[];
      setHelmData(releases);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      
      if (errorMsg.includes('Kubernetes cluster unreachable') || errorMsg.includes('127.0.0.1:6443')) {
        setShowKubeconfig(true);
      } else if (errorMsg.includes('Helm command failed')) {
        setError(`${errorMsg}\n\n🔧 Solution Options:\n1. Make sure Helm is installed: https://helm.sh/docs/intro/install/\n2. Run 'helm version' to verify installation\n3. For Windows: try 'choco install kubernetes-helm'`);
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleKubeconfigSubmit(configText: string) {
    try {
      await invoke('set_kubeconfig', { configText });
      setError('');
      getReleases();
    } catch (e) {
      setError(`Failed to update kubeconfig: ${e}`);
    }
  }

  // Expose fetchReleases for context switcher
  const fetchReleases = useCallback(() => {
    getReleases();
  }, [getReleases]);

  useEffect(() => {
    getReleases();
  }, [getReleases]);

  return (
    <>
      <div>
        {/* Mobile sidebar */}
        <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 xl:hidden">
          <DialogBackdrop
            transition
            className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
          />

          <div className="fixed inset-0 flex">
            <DialogPanel
              transition
              className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
            >
              <TransitionChild>
                <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                  <button type="button" onClick={() => setSidebarOpen(false)} className="-m-2.5 p-2.5">
                    <span className="sr-only">Close sidebar</span>
                    <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                  </button>
                </div>
              </TransitionChild>

              <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-gray-50 px-6 dark:bg-gray-900 dark:ring dark:ring-white/10">
                <div className="relative flex h-16 shrink-0 items-center">
                  <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Rudder</h1>
                </div>
                <nav className="relative flex flex-1 flex-col">
                  <ul role="list" className="flex flex-1 flex-col gap-y-7">
                    <li>
                      <ul role="list" className="-mx-2 space-y-1">
                        {navigation.map((item) => (
                          <li key={item.name}>
                            <a
                              href={item.href}
                              className={classNames(
                                item.current
                                  ? 'bg-gray-100 text-indigo-600 dark:bg-white/5 dark:text-white'
                                  : 'text-gray-700 hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
                                'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                              )}
                            >
                              <item.icon
                                aria-hidden="true"
                                className={classNames(
                                  item.current
                                    ? 'text-indigo-600 dark:text-white'
                                    : 'text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white',
                                  'size-6 shrink-0',
                                )}
                              />
                              {item.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </li>
                  </ul>
                </nav>
              </div>
            </DialogPanel>
          </div>
        </Dialog>

        {/* Static sidebar for desktop */}
        <div className="hidden xl:fixed xl:inset-y-0 xl:z-50 xl:flex xl:w-72 xl:flex-col dark:bg-gray-900">
          <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-gray-50 px-6 ring-1 ring-gray-200 dark:bg-black/10 dark:ring-white/5">
            <div className="flex h-16 shrink-0 items-center">
              <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Rudder</h1>
            </div>
            <nav className="flex flex-1 flex-col">
              <ul role="list" className="flex flex-1 flex-col gap-y-7">
                <li>
                  <ul role="list" className="-mx-2 space-y-1">
                    {navigation.map((item) => (
                      <li key={item.name}>
                        <a
                          href={item.href}
                          className={classNames(
                            item.current
                              ? 'bg-gray-100 text-indigo-600 dark:bg-white/5 dark:text-white'
                              : 'text-gray-700 hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
                            'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                          )}
                        >
                          <item.icon
                            aria-hidden="true"
                            className={classNames(
                              item.current
                                ? 'text-indigo-600 dark:text-white'
                                : 'text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white',
                              'size-6 shrink-0',
                            )}
                          />
                          {item.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="xl:pl-72">
          {/* Sticky search header */}
          <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-6 border-b border-gray-200 bg-white px-4 shadow-xs sm:px-6 lg:px-8 dark:border-white/5 dark:bg-gray-900 dark:shadow-none">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="-m-2.5 p-2.5 text-gray-900 xl:hidden dark:text-white"
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3Icon aria-hidden="true" className="size-5" />
            </button>

            <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
              <form onSubmit={(e) => e.preventDefault()} className="grid flex-1 grid-cols-1">
                <input
                  ref={searchInputRef}
                  name="search"
                  placeholder="Search releases... (Ctrl+K)"
                  aria-label="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="col-start-1 row-start-1 block size-full bg-transparent pl-8 text-base text-gray-900 outline-hidden placeholder:text-gray-400 sm:text-sm/6 dark:text-white dark:placeholder:text-gray-500"
                />
                <MagnifyingGlassIcon
                  aria-hidden="true"
                  className="pointer-events-none col-start-1 row-start-1 size-5 self-center text-gray-400 dark:text-gray-500"
                />
              </form>
              {/* Context Switcher */}
              <div className="hidden lg:flex lg:items-center">
                <ContextSwitcher 
                  className="w-64"
                  onContextChange={() => {
                    // Refresh releases when context changes
                    fetchReleases();
                  }}
                />
              </div>
            </div>
          </div>

          <main className="lg:pr-96">
            <header className="flex items-center justify-between border-b border-gray-200 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 dark:border-white/5">
              <div className="flex items-center gap-4">
                <h1 className="text-base/7 font-semibold text-gray-900 dark:text-white">Helm Releases</h1>
                {/* Namespace filter */}
                <div className="flex items-center gap-2">
                  <FunnelIcon className="size-4 text-gray-400" />
                  <select
                    value={selectedNamespace}
                    onChange={(e) => setSelectedNamespace(e.target.value)}
                    className="block rounded-md border-0 py-1 pl-2 pr-8 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 text-xs dark:bg-gray-800 dark:text-white dark:ring-white/10"
                  >
                    {namespaces.map((ns) => (
                      <option key={ns} value={ns}>
                        {ns === 'all' ? 'All namespaces' : ns}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Sort control */}
                <div className="flex items-center gap-2">
                  <ChevronUpDownIcon className="size-4 text-gray-400" />
                  <select
                    value={`${sortField}-${sortDirection}`}
                    onChange={(e) => {
                      const [field, dir] = e.target.value.split('-') as [SortField, SortDirection];
                      setSortField(field);
                      setSortDirection(dir);
                    }}
                    className="block rounded-md border-0 py-1 pl-2 pr-8 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 text-xs dark:bg-gray-800 dark:text-white dark:ring-white/10"
                  >
                    <option value="name-asc">Name A-Z</option>
                    <option value="name-desc">Name Z-A</option>
                    <option value="namespace-asc">Namespace A-Z</option>
                    <option value="namespace-desc">Namespace Z-A</option>
                    <option value="status-asc">Status A-Z</option>
                    <option value="updated-desc">Recently Updated</option>
                    <option value="updated-asc">Oldest Updated</option>
                  </select>
                </div>
              </div>

              <button
                onClick={getReleases}
                disabled={loading}
                className="flex items-center gap-x-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                title="Refresh (Ctrl+R)"
              >
                <ArrowPathIcon aria-hidden="true" className={classNames("-ml-1.5 size-5", loading ? "animate-spin" : "")} />
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </header>

            {/* Show kubeconfig paste dialog when cluster is unreachable */}
            {showKubeconfig && (
              <div className="px-4 py-4 sm:px-6 lg:px-8">
                <KubeconfigPaste onConfigSubmit={handleKubeconfigSubmit} />
              </div>
            )}

            {error && !showKubeconfig && (
              <div className="px-4 py-4 sm:px-6 lg:px-8">
                <div className="rounded-md bg-red-50 p-4 dark:bg-red-500/10">
                  <div className="flex">
                    <div className="ml-3 flex-1">
                      <h3 className="text-sm font-medium text-red-800 dark:text-red-400">Error</h3>
                      <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                        <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={getReleases}
                          className="inline-flex items-center gap-x-1.5 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500"
                        >
                          <ArrowPathIcon className="-ml-0.5 size-4" />
                          Retry
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Releases list */}
            {loading ? (
              <div className="px-4 py-12 text-center sm:px-6 lg:px-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading Helm releases...</p>
              </div>
            ) : helmData.length === 0 ? (
              <div className="px-4 py-12 text-center sm:px-6 lg:px-8">
                <ServerIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">No Helm releases found</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Make sure Helm is installed and you have access to a Kubernetes cluster
                </p>
              </div>
            ) : filteredReleases.length === 0 ? (
              <div className="px-4 py-12 text-center sm:px-6 lg:px-8">
                <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  No releases match {searchQuery ? `"${searchQuery}"` : 'the selected filters'}
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedNamespace('all');
                  }}
                  className="mt-2 text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <ul role="list" className="divide-y divide-gray-100 dark:divide-white/5">
                {sortedReleases.map((release) => (
                  <li
                    key={`${release.namespace}-${release.name}`}
                    className="relative flex items-center space-x-4 px-4 py-4 sm:px-6 lg:px-8"
                  >
                    <div className="min-w-0 flex-auto">
                      <div className="flex items-center gap-x-3">
                        <div
                          className={classNames(
                            statuses[release.status as keyof typeof statuses] || statuses.pending,
                            'flex-none rounded-full p-1',
                          )}
                        >
                          <div className="size-2 rounded-full bg-current" />
                        </div>
                        <h2 className="min-w-0 text-sm/6 font-semibold text-gray-900 dark:text-white">
                          <button onClick={() => setSelectedRelease(release)} className="flex gap-x-2">
                            <span className="truncate">{release.namespace}</span>
                            <span className="text-gray-400">/</span>
                            <span className="whitespace-nowrap">{release.name}</span>
                          </button>
                        </h2>
                      </div>
                      <div className="mt-3 flex items-center gap-x-2.5 text-xs/5 text-gray-500 dark:text-gray-400">
                        <p className="truncate font-mono">{release.chart}</p>
                        <svg viewBox="0 0 2 2" className="size-0.5 flex-none fill-gray-300 dark:fill-gray-500">
                          <circle r={1} cx={1} cy={1} />
                        </svg>
                        <p className="whitespace-nowrap">
                          Updated {new Date(release.updated).toLocaleDateString()}
                        </p>
                        <svg viewBox="0 0 2 2" className="size-0.5 flex-none fill-gray-300 dark:fill-gray-500">
                          <circle r={1} cx={1} cy={1} />
                        </svg>
                        <p className="whitespace-nowrap">Rev {release.revision}</p>
                      </div>
                    </div>
                    <div
                      className={classNames(
                        statuses[release.status as keyof typeof statuses] || statuses.pending,
                        'flex-none rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset',
                      )}
                    >
                      {release.status}
                    </div>
                    <ChevronRightIcon aria-hidden="true" className="size-5 flex-none text-gray-400" />
                  </li>
                ))}
              </ul>
            )}
          </main>

          {/* Activity feed */}
          <aside className="bg-gray-50 lg:fixed lg:top-16 lg:right-0 lg:bottom-0 lg:w-96 lg:overflow-y-auto lg:border-l lg:border-gray-200 dark:bg-black/10 dark:lg:border-white/5">
            <header className="flex items-center justify-between border-b border-gray-200 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 dark:border-white/5">
              <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">Statistics</h2>
            </header>
            <div className="px-4 py-6 sm:px-6 lg:px-8">
              <dl className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Releases</dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{stats.total}</dd>
                </div>
                <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Namespaces</dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{stats.namespaces}</dd>
                </div>
                <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10">
                  <dt className="text-xs font-medium text-green-600 dark:text-green-400">Deployed</dt>
                  <dd className="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">{stats.deployed}</dd>
                </div>
                <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10">
                  <dt className="text-xs font-medium text-red-600 dark:text-red-400">Failed</dt>
                  <dd className="mt-1 text-2xl font-semibold text-red-600 dark:text-red-400">{stats.failed}</dd>
                </div>
                {stats.pending > 0 && (
                  <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10">
                    <dt className="text-xs font-medium text-yellow-600 dark:text-yellow-400">Pending</dt>
                    <dd className="mt-1 text-2xl font-semibold text-yellow-600 dark:text-yellow-400">{stats.pending}</dd>
                  </div>
                )}
                <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Unique Charts</dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{stats.uniqueCharts}</dd>
                </div>
              </dl>
              
              {/* Keyboard shortcuts help */}
              <div className="mt-8 rounded-lg bg-gray-100 p-4 dark:bg-gray-800/50">
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Keyboard Shortcuts</h3>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Focus search</dt>
                    <dd className="font-mono text-gray-700 dark:text-gray-300">Ctrl+K</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Clear search</dt>
                    <dd className="font-mono text-gray-700 dark:text-gray-300">Esc</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Refresh</dt>
                    <dd className="font-mono text-gray-700 dark:text-gray-300">Ctrl+R</dd>
                  </div>
                </dl>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Release Editor Modal */}
      {selectedRelease && (() => {
        // Parse chart name and version from the chart string (e.g., "trivy-operator-0.19.0")
        const versionMatch = selectedRelease.chart.match(/-(\d+\.\d+\.\d+)$/);
        const chartVersion = versionMatch ? versionMatch[1] : '';
        const chartName = versionMatch 
          ? selectedRelease.chart.substring(0, versionMatch.index).trim()
          : selectedRelease.chart;
        
        return (
          <ReleaseEditor
            releaseName={selectedRelease.name}
            namespace={selectedRelease.namespace}
            chartPath={selectedRelease.chart}
            chartName={chartName}
            chartVersion={chartVersion}
            // Default repo name, could be enhanced to detect from chart info
            repoName="stable"
            onClose={() => setSelectedRelease(null)}
            onSuccess={getReleases}
          />
        );
      })()
      }
    </>
  );
}

export default App;
