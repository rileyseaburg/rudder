'use client'

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import RecursiveForm from './SchemaForm';
import SimpleCodeEditor from './SimpleCodeEditor';

interface ReleaseEditorProps {
  releaseName: string;
  namespace: string;
  chartPath: string;
  chartName: string;
  chartVersion: string;
  repoName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface SchemaProperty {
  type: 'string' | 'boolean' | 'integer' | 'number' | 'object' | 'array';
  description?: string;
  default?: any;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  enum?: string[];
}

interface HelmRevision {
  revision: number;
  updated: string;
  status: string;
  chart: string;
  app_version: string;
  description: string;
}

function ReleaseEditor({ releaseName, namespace, chartPath, chartName, chartVersion, repoName = "default", onClose, onSuccess }: ReleaseEditorProps) {
  const [activeTab, setActiveTab] = useState<'values' | 'history'>('values');
  const [schema, setSchema] = useState<Record<string, SchemaProperty> | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [upgrading, setUpgrading] = useState<boolean>(false);
  const [success, setSuccess] = useState<string>('');
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [rawValues, setRawValues] = useState<string>('');
  const [currentValues, setCurrentValues] = useState<any>({});
  
  // History tab state
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string>('');
  const [revisions, setRevisions] = useState<HelmRevision[]>([]);
  const [rollingBack, setRollingBack] = useState<boolean>(false);

  useEffect(() => {
    loadSchema();
  }, []);

  useEffect(() => {
    if (activeTab === 'history' && revisions.length === 0) {
      loadHistory();
    }
  }, [activeTab]);

  async function loadSchema() {
    try {
      setLoading(true);
      setError('');
      console.log(`Loading schema for chart: ${chartName} version ${chartVersion} from repo ${repoName}`);
      
      // First load the schema
      const schemaJson = await invoke<string>('get_schema_for_chart', { 
        chartName,
        chartVersion,
        repoName,
        namespace,
        releaseName,
        app: window.__TAURI__ 
      });
      const parsedSchema = JSON.parse(schemaJson);
      
      // Always set schema - use empty properties if none exist
      const schema = parsedSchema.properties || {};
      console.log('Parsed schema:', schema);
      console.log('Schema keys:', Object.keys(schema));
      setSchema(schema);
      
      // Try to get the current values from the release
      try {
        // In a real implementation, you would invoke a command to get current values
        // For now, we'll use defaults if schema is available or empty object if not
        let values: any = {};
        
        if (currentValues && Object.keys(currentValues).length > 0) {
          values = currentValues;
        } else {
          // Extract defaults from schema if available
          Object.entries(schema).forEach(([key, prop]: [string, any]) => {
            if (prop.default !== undefined) {
              values[key] = prop.default;
            }
          });
        }
        
        console.log('Using values:', values);
        setFormData(values);
        setCurrentValues(values);
        setRawValues(JSON.stringify(values, null, 2));
      } catch (err: any) {
        console.error('Failed to load current values:', err);
        // Use at least values from schema
        const defaults: any = {};
        Object.entries(schema).forEach(([key, prop]: [string, any]) => {
          if (prop.default !== undefined) {
            defaults[key] = prop.default;
          } 
        });
        console.log('Using default values:', defaults);
        setFormData(defaults);
        setCurrentValues(defaults);
        setRawValues(JSON.stringify(defaults, null, 2));
      }
    } catch (e) {
      setError(`Failed to load schema: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      setHistoryLoading(true);
      setHistoryError('');
      console.log(`Loading history for release: ${releaseName} in namespace: ${namespace}`);
      
      const historyJson = await invoke<string>('get_helm_history', {
        releaseName,
        namespace,
        app: window.__TAURI__
      });
      
      const parsedHistory: HelmRevision[] = JSON.parse(historyJson);
      console.log('Parsed history:', parsedHistory);
      setRevisions(parsedHistory.reverse()); // Show newest first
    } catch (e) {
      setHistoryError(`Failed to load history: ${e}`);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleRollback(revision: number) {
    if (!confirm(`Are you sure you want to rollback to revision ${revision}?`)) {
      return;
    }
    
    try {
      setRollingBack(true);
      setHistoryError('');
      
      await invoke<string>('helm_rollback', {
        releaseName,
        namespace,
        revision,
        app: window.__TAURI__
      });
      
      setSuccess(`Successfully rolled back to revision ${revision}`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (e) {
      setHistoryError(`Rollback failed: ${e}`);
    } finally {
      setRollingBack(false);
    }
  }

  async function handleUpgrade() {
    try {
      setUpgrading(true);
      setError('');
      setSuccess('');
      
      let valuesJson;
      if (schema && Object.keys(schema).length === 0 && rawValues) {
        // Use raw values when no schema is available
        valuesJson = rawValues;
      } else {
        // Use form data
        valuesJson = JSON.stringify(formData);
      }
      
      await invoke<string>('helm_upgrade', {
        releaseName,
        chartPath,
        valuesJson,
      });
      
      setSuccess(`Successfully upgraded release: ${releaseName}`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (e) {
      setError(`Upgrade failed: ${e}`);
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:bg-gray-900/80"
      />

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-4xl sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95 dark:bg-gray-800"
          >
            <div className="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 dark:bg-gray-800 dark:text-gray-500 dark:hover:text-white"
              >
                <span className="sr-only">Close</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
            </div>

            <div className="sm:flex sm:items-start">
              <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">
                <DialogTitle as="h3" className="text-xl font-semibold text-gray-900 dark:text-white">
                  Edit Release
                </DialogTitle>
                <div className="mt-1">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {releaseName} <span className="text-gray-400 dark:text-gray-500">in</span> {namespace}
                  </p>
                </div>

                {/* Tabs */}
                <div className="mt-6 border-b border-gray-200 dark:border-gray-700">
                  <nav className="-mb-px flex space-x-8">
                    <button
                      onClick={() => setActiveTab('values')}
                      className={`${
                        activeTab === 'values'
                          ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                      } whitespace-nowrap border-b-2 px-1 pb-4 text-sm font-medium`}
                    >
                      Values
                    </button>
                    <button
                      onClick={() => setActiveTab('history')}
                      className={`${
                        activeTab === 'history'
                          ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                      } whitespace-nowrap border-b-2 px-1 pb-4 text-sm font-medium`}
                    >
                      History
                    </button>
                  </nav>
                </div>

                {/* Content */}
                <div className="mt-6 max-h-96 overflow-y-auto">
                  {/* Values Tab */}
                  {activeTab === 'values' && (
                    <>
                      {loading && (
                        <div className="text-center py-12">
                          <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading schema...</p>
                        </div>
                      )}

                      {error && (
                    <div className="rounded-md bg-red-50 p-4 dark:bg-red-500/10">
                      <div className="flex">
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800 dark:text-red-400">Error</h3>
                          <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                            <p>{error}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {success && (
                    <div className="rounded-md bg-green-50 p-4 dark:bg-green-500/10">
                      <div className="flex">
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-green-800 dark:text-green-400">Success</h3>
                          <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                            <p>{success}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!loading && schema !== null && Object.keys(schema).length > 0 && (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Configure the values for this Helm release. Changes will be applied when you click "Upgrade Release".
                      </p>
                      
                      <RecursiveForm
                        schema={schema}
                        formData={formData}
                        onChange={setFormData}
                      />
                    </div>
                  )}

                  {!loading && schema !== null && Object.keys(schema).length === 0 && !error && (
                    <div className="space-y-4">
                      <div className="rounded-md bg-yellow-50 p-4 dark:bg-yellow-500/10">
                        <div className="flex">
                          <div className="ml-3 flex-1">
                            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-400">No Schema Available</h3>
                            <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                              <p>This chart does not have a values.schema.json file. You can edit the values directly as JSON or continue with default values.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Edit Values (JSON Format)
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowRawEditor(!showRawEditor)}
                            className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            {showRawEditor ? 'Hide' : 'Show'} Editor
                          </button>
                        </div>
                        {showRawEditor && (
                          <div className="border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
                            <SimpleCodeEditor
                              value={rawValues}
                              onChange={(value) => setRawValues(value)}
                              language="json"
                              height="300px"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                      {!loading && schema === null && !error && (
                        <div className="text-center py-12">
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            No schema found for this chart.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* History Tab */}
                  {activeTab === 'history' && (
                    <>
                      {historyLoading && (
                        <div className="text-center py-12">
                          <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading history...</p>
                        </div>
                      )}

                      {historyError && (
                        <div className="rounded-md bg-red-50 p-4 dark:bg-red-500/10">
                          <div className="flex">
                            <div className="ml-3">
                              <h3 className="text-sm font-medium text-red-800 dark:text-red-400">Error</h3>
                              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                                <p>{historyError}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {!historyLoading && !historyError && revisions.length === 0 && (
                        <div className="text-center py-12">
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            No revision history found for this release.
                          </p>
                        </div>
                      )}

                      {!historyLoading && revisions.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            View and rollback to previous revisions of this release.
                          </p>
                          {revisions.map((rev) => (
                            <div
                              key={rev.revision}
                              className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                      Revision {rev.revision}
                                    </h4>
                                    <span
                                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                                        rev.status === 'deployed'
                                          ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/20'
                                          : rev.status === 'superseded'
                                          ? 'bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-600/20 dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/20'
                                          : rev.status === 'failed'
                                          ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20'
                                          : 'bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-600/20 dark:bg-yellow-500/10 dark:text-yellow-400 dark:ring-yellow-500/20'
                                      }`}
                                    >
                                      {rev.status}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Updated: {new Date(rev.updated).toLocaleString()}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Chart: {rev.chart} | App Version: {rev.app_version}
                                  </p>
                                  {rev.description && (
                                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                                      {rev.description}
                                    </p>
                                  )}
                                </div>
                                {rev.status !== 'deployed' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRollback(rev.revision)}
                                    disabled={rollingBack}
                                    className="ml-4 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                                  >
                                    {rollingBack ? 'Rolling back...' : 'Rollback'}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-6 border-t border-gray-200 pt-4 dark:border-white/10">
                  <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                    Chart: <code className="rounded bg-gray-100 px-2 py-1 font-mono dark:bg-gray-700">{chartPath}</code>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={upgrading || rollingBack}
                      className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20"
                    >
                      {activeTab === 'history' ? 'Close' : 'Cancel'}
                    </button>
                    {activeTab === 'values' && (
                      <button
                        type="button"
                        onClick={handleUpgrade}
                        disabled={upgrading || !schema || loading}
                        className="inline-flex items-center gap-x-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                      >
                        {upgrading ? (
                          <>
                            <ArrowPathIcon className="-ml-0.5 size-5 animate-spin" />
                            Upgrading...
                          </>
                        ) : (
                          'Upgrade Release'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}

export default ReleaseEditor;
