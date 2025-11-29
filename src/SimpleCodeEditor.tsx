'use client'

interface SimpleCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  height?: string;
  placeholder?: string;
}

export default function SimpleCodeEditor({ 
  value, 
  onChange, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  language = 'json', 
  height = '300px',
  placeholder = ''
}: SimpleCodeEditorProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-full p-3 font-mono text-sm bg-gray-50 border-0 resize-none focus:ring-0 focus:outline-none dark:bg-gray-900 dark:text-white"
      style={{ height }}
      spellCheck={false}
    />
  );
}