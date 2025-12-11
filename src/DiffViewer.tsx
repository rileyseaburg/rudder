'use client'

import { useState, useMemo } from 'react';
import {
  PlusIcon,
  MinusIcon,
  ArrowsRightLeftIcon,
  DocumentDuplicateIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface DiffSection {
  header: string;
  lines: DiffLine[];
  expanded: boolean;
}

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  oldLabel?: string;
  newLabel?: string;
  mode?: 'unified' | 'split';
}

// Simple diff algorithm that compares line by line
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: DiffLine[] = [];

  // LCS-based diff for better results
  const lcs = computeLCS(oldLines, newLines);
  
  let oldIdx = 0;
  let newIdx = 0;
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const match of lcs) {
    // Add removed lines (in old but not matched)
    while (oldIdx < match.oldIndex) {
      result.push({
        type: 'removed',
        content: oldLines[oldIdx],
        oldLineNum: oldLineNum++,
      });
      oldIdx++;
    }

    // Add added lines (in new but not matched)
    while (newIdx < match.newIndex) {
      result.push({
        type: 'added',
        content: newLines[newIdx],
        newLineNum: newLineNum++,
      });
      newIdx++;
    }

    // Add unchanged line
    result.push({
      type: 'unchanged',
      content: oldLines[oldIdx],
      oldLineNum: oldLineNum++,
      newLineNum: newLineNum++,
    });
    oldIdx++;
    newIdx++;
  }

  // Add remaining removed lines
  while (oldIdx < oldLines.length) {
    result.push({
      type: 'removed',
      content: oldLines[oldIdx],
      oldLineNum: oldLineNum++,
    });
    oldIdx++;
  }

  // Add remaining added lines
  while (newIdx < newLines.length) {
    result.push({
      type: 'added',
      content: newLines[newIdx],
      newLineNum: newLineNum++,
    });
    newIdx++;
  }

  return result;
}

interface LCSMatch {
  oldIndex: number;
  newIndex: number;
}

function computeLCS(oldLines: string[], newLines: string[]): LCSMatch[] {
  const m = oldLines.length;
  const n = newLines.length;

  // DP table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find matches
  const matches: LCSMatch[] = [];
  let i = m, j = n;

  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      matches.unshift({ oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}

// Group consecutive changes into sections for collapsible display
function groupIntoSections(lines: DiffLine[], contextLines: number = 3): DiffSection[] {
  const sections: DiffSection[] = [];
  let currentSection: DiffSection | null = null;
  let unchangedBuffer: DiffLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.type === 'unchanged') {
      unchangedBuffer.push(line);
      
      // If we have many unchanged lines, we might want to start a new section
      if (unchangedBuffer.length > contextLines * 2 && currentSection) {
        // Add context lines to current section
        currentSection.lines.push(...unchangedBuffer.slice(0, contextLines));
        sections.push(currentSection);
        currentSection = null;
        unchangedBuffer = unchangedBuffer.slice(-contextLines);
      }
    } else {
      // We have a change
      if (!currentSection) {
        // Start a new section
        currentSection = {
          header: `Changes around line ${line.oldLineNum || line.newLineNum || 1}`,
          lines: [...unchangedBuffer.slice(-contextLines)],
          expanded: true,
        };
        unchangedBuffer = [];
      } else if (unchangedBuffer.length > 0) {
        // Add buffered unchanged lines
        currentSection.lines.push(...unchangedBuffer);
        unchangedBuffer = [];
      }
      
      currentSection.lines.push(line);
    }
  }

  // Handle remaining content
  if (currentSection) {
    currentSection.lines.push(...unchangedBuffer.slice(0, contextLines));
    sections.push(currentSection);
  } else if (unchangedBuffer.length > 0 && sections.length === 0) {
    // No changes at all
    sections.push({
      header: 'No changes',
      lines: unchangedBuffer,
      expanded: true,
    });
  }

  return sections;
}

export default function DiffViewer({
  oldContent,
  newContent,
  oldLabel = 'Current',
  newLabel = 'New',
  mode = 'unified',
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>(mode);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [showUnchanged, setShowUnchanged] = useState(false);

  const diffLines = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent]);
  const sections = useMemo(() => groupIntoSections(diffLines), [diffLines]);

  const stats = useMemo(() => {
    const added = diffLines.filter(l => l.type === 'added').length;
    const removed = diffLines.filter(l => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const hasChanges = stats.added > 0 || stats.removed > 0;

  if (!hasChanges) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
        <DocumentDuplicateIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No Changes</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The configuration is identical to the current values.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <PlusIcon className="h-4 w-4" />
              {stats.added} added
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <MinusIcon className="h-4 w-4" />
              {stats.removed} removed
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <input
              type="checkbox"
              checked={showUnchanged}
              onChange={(e) => setShowUnchanged(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600"
            />
            Show all lines
          </label>
          <button
            onClick={() => setViewMode(viewMode === 'unified' ? 'split' : 'unified')}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ArrowsRightLeftIcon className="h-3.5 w-3.5" />
            {viewMode === 'unified' ? 'Split View' : 'Unified View'}
          </button>
        </div>
      </div>

      {/* Labels */}
      {viewMode === 'split' && (
        <div className="grid grid-cols-2 gap-2 text-xs font-medium">
          <div className="rounded bg-red-50 px-2 py-1 text-red-700 dark:bg-red-500/10 dark:text-red-400">
            {oldLabel}
          </div>
          <div className="rounded bg-green-50 px-2 py-1 text-green-700 dark:bg-green-500/10 dark:text-green-400">
            {newLabel}
          </div>
        </div>
      )}

      {/* Diff Content */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {viewMode === 'unified' ? (
          <UnifiedView
            sections={sections}
            expandedSections={expandedSections}
            toggleSection={toggleSection}
            showUnchanged={showUnchanged}
          />
        ) : (
          <SplitView
            diffLines={diffLines}
            showUnchanged={showUnchanged}
          />
        )}
      </div>
    </div>
  );
}

function UnifiedView({
  sections,
  expandedSections,
  toggleSection,
  showUnchanged,
}: {
  sections: DiffSection[];
  expandedSections: Set<number>;
  toggleSection: (index: number) => void;
  showUnchanged: boolean;
}) {
  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      {sections.map((section, sectionIdx) => (
        <div key={sectionIdx}>
          {/* Section header */}
          <button
            onClick={() => toggleSection(sectionIdx)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {expandedSections.has(sectionIdx) ? (
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-gray-500" />
            )}
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {section.header}
            </span>
          </button>

          {/* Section content */}
          {expandedSections.has(sectionIdx) && (
            <div className="font-mono text-xs">
              {section.lines.map((line, lineIdx) => {
                if (!showUnchanged && line.type === 'unchanged') {
                  return null;
                }

                return (
                  <div
                    key={lineIdx}
                    className={`flex ${
                      line.type === 'added'
                        ? 'bg-green-50 dark:bg-green-500/10'
                        : line.type === 'removed'
                        ? 'bg-red-50 dark:bg-red-500/10'
                        : ''
                    }`}
                  >
                    <div className="w-8 flex-shrink-0 text-right pr-2 py-0.5 text-gray-400 select-none border-r border-gray-200 dark:border-gray-700">
                      {line.oldLineNum || ''}
                    </div>
                    <div className="w-8 flex-shrink-0 text-right pr-2 py-0.5 text-gray-400 select-none border-r border-gray-200 dark:border-gray-700">
                      {line.newLineNum || ''}
                    </div>
                    <div className="w-6 flex-shrink-0 text-center py-0.5 select-none">
                      {line.type === 'added' && (
                        <span className="text-green-600 dark:text-green-400">+</span>
                      )}
                      {line.type === 'removed' && (
                        <span className="text-red-600 dark:text-red-400">-</span>
                      )}
                    </div>
                    <div
                      className={`flex-1 py-0.5 px-2 whitespace-pre overflow-x-auto ${
                        line.type === 'added'
                          ? 'text-green-800 dark:text-green-300'
                          : line.type === 'removed'
                          ? 'text-red-800 dark:text-red-300'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {line.content || ' '}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SplitView({
  diffLines,
  showUnchanged,
}: {
  diffLines: DiffLine[];
  showUnchanged: boolean;
}) {
  // Build parallel arrays for left (old) and right (new)
  const pairs: { left: DiffLine | null; right: DiffLine | null }[] = [];
  
  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    
    if (line.type === 'unchanged') {
      pairs.push({ left: line, right: line });
      i++;
    } else if (line.type === 'removed') {
      // Collect consecutive removed lines
      const removed: DiffLine[] = [];
      while (i < diffLines.length && diffLines[i].type === 'removed') {
        removed.push(diffLines[i]);
        i++;
      }
      
      // Collect consecutive added lines
      const added: DiffLine[] = [];
      while (i < diffLines.length && diffLines[i].type === 'added') {
        added.push(diffLines[i]);
        i++;
      }
      
      // Pair them up
      const maxLen = Math.max(removed.length, added.length);
      for (let j = 0; j < maxLen; j++) {
        pairs.push({
          left: removed[j] || null,
          right: added[j] || null,
        });
      }
    } else if (line.type === 'added') {
      pairs.push({ left: null, right: line });
      i++;
    } else {
      i++;
    }
  }

  return (
    <div className="font-mono text-xs">
      {pairs.map((pair, idx) => {
        if (!showUnchanged && pair.left?.type === 'unchanged') {
          return null;
        }

        return (
          <div key={idx} className="flex">
            {/* Left side (old/removed) */}
            <div
              className={`w-1/2 flex border-r border-gray-200 dark:border-gray-700 ${
                pair.left?.type === 'removed'
                  ? 'bg-red-50 dark:bg-red-500/10'
                  : ''
              }`}
            >
              <div className="w-8 flex-shrink-0 text-right pr-2 py-0.5 text-gray-400 select-none border-r border-gray-200 dark:border-gray-700">
                {pair.left?.oldLineNum || ''}
              </div>
              <div
                className={`flex-1 py-0.5 px-2 whitespace-pre overflow-x-auto ${
                  pair.left?.type === 'removed'
                    ? 'text-red-800 dark:text-red-300'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {pair.left?.content || ' '}
              </div>
            </div>

            {/* Right side (new/added) */}
            <div
              className={`w-1/2 flex ${
                pair.right?.type === 'added'
                  ? 'bg-green-50 dark:bg-green-500/10'
                  : ''
              }`}
            >
              <div className="w-8 flex-shrink-0 text-right pr-2 py-0.5 text-gray-400 select-none border-r border-gray-200 dark:border-gray-700">
                {pair.right?.newLineNum || ''}
              </div>
              <div
                className={`flex-1 py-0.5 px-2 whitespace-pre overflow-x-auto ${
                  pair.right?.type === 'added'
                    ? 'text-green-800 dark:text-green-300'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {pair.right?.content || ' '}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Export a specialized YAML diff component that parses and formats YAML for better diffs
export function YamlDiffViewer({
  oldYaml,
  newYaml,
  ...props
}: Omit<DiffViewerProps, 'oldContent' | 'newContent'> & {
  oldYaml: string;
  newYaml: string;
}) {
  return (
    <DiffViewer
      oldContent={oldYaml}
      newContent={newYaml}
      {...props}
    />
  );
}
