'use client'

import { Input, Switch, Field, Label, Description } from '@headlessui/react';
import { MinusCircleIcon, PlusCircleIcon } from '@heroicons/react/20/solid';
import { ChangeEvent } from 'react';

interface SchemaProperty {
  type: 'string' | 'boolean' | 'integer' | 'number' | 'object' | 'array';
  description?: string;
  default?: any;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  enum?: string[];
}

interface SchemaFormProps {
  schema: Record<string, SchemaProperty>;
  formData: any;
  onChange: (newData: any) => void;
  level?: number;
}

function RecursiveForm({ schema, formData, onChange, level = 0 }: SchemaFormProps) {
  const indentClass = level > 0 ? 'ml-6 pl-4 border-l-2 border-gray-200 dark:border-gray-700' : '';

  const formatValueForInput = (v: any) => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') {
      try {
        return JSON.stringify(v, null, 2);
      } catch {
        return String(v);
      }
    }
    return String(v);
  };

  // Infer a schema from a runtime value. This helps when the schema is missing but
  // we have an existing value, such as `tls` items or initContainers.
  const inferSchemaFromValue = (value: any): Record<string, SchemaProperty> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const result: Record<string, SchemaProperty> = {};
    Object.entries(value).forEach(([k, v]) => {
      if (v === null || v === undefined) {
        result[k] = { type: 'string' };
      } else if (Array.isArray(v)) {
        const first = v[0];
        if (typeof first === 'object' && first !== null) {
          result[k] = { type: 'array', items: { type: 'object', properties: inferSchemaFromValue(first) } };
        } else if (typeof first === 'number') {
          result[k] = { type: 'array', items: { type: Number.isInteger(first) ? 'integer' : 'number' } };
        } else if (typeof first === 'boolean') {
          result[k] = { type: 'array', items: { type: 'boolean' } };
        } else {
          result[k] = { type: 'array', items: { type: 'string' } };
        }
      } else if (typeof v === 'object') {
        result[k] = { type: 'object', properties: inferSchemaFromValue(v) };
      } else if (typeof v === 'boolean') {
        result[k] = { type: 'boolean' };
      } else if (typeof v === 'number') {
        result[k] = { type: Number.isInteger(v) ? 'integer' : 'number' };
      } else {
        result[k] = { type: 'string' };
      }
    });

    return result;
  };

  const parseInputValue = (s: string, expectedType?: string) => {
    const trimmed = s.trim();
    if (trimmed === '') return undefined;

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return s;
      }
    }

    if (expectedType === 'integer') {
      const n = parseInt(trimmed, 10);
      return isNaN(n) ? trimmed : n;
    }

    if (expectedType === 'number') {
      const n = parseFloat(trimmed);
      return isNaN(n) ? trimmed : n;
    }

    return s;
  };

  // Normalize value: always try to parse JSON strings to avoid showing raw JSON in UI
  const normalizeValue = (value: any, schemaType: string) => {
    if (value === undefined || value === null) return value;
    
    // Always try to parse JSON strings, regardless of schema type
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          return JSON.parse(trimmed);
        } catch {
          // If parsing fails, keep as string
        }
      }
    }
    
    // Handle expected types
    if (schemaType === 'array' && !Array.isArray(value)) {
      return [];
    }
    if (schemaType === 'object' && typeof value !== 'object') {
      return {};
    }
    
    return value;
  };

  return (
    <div className={`space-y-6 ${indentClass}`}>
      {Object.entries(schema).map(([key, prop]) => {
        const rawValue = formData[key] ?? prop.default;
        const value = normalizeValue(rawValue, prop.type as string);

        const handleChange = (newValue: any) => {
          onChange({ ...formData, [key]: newValue });
        };

        switch (prop.type) {
          case 'string':
            if (prop.enum) {
              return (
                <Field key={key}>
                  <Label className="block text-sm font-medium text-gray-900 dark:text-white">{key}</Label>
                  {prop.description && (
                    <Description className="text-sm text-gray-500 dark:text-gray-400 mt-1">{prop.description}</Description>
                  )}
                  <select
                    className="mt-2 block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-indigo-500"
                    value={value || ''}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handleChange(e.target.value)}
                  >
                    <option value="">Select...</option>
                    {prop.enum.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            }
            return (
              <Field key={key}>
                <Label className="block text-sm font-medium text-gray-900 dark:text-white">{key}</Label>
                {prop.description && (
                  <Description className="text-sm text-gray-500 dark:text-gray-400 mt-1">{prop.description}</Description>
                )}
                <Input
                  className="mt-2 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-indigo-500"
                  type="text"
                  value={formatValueForInput(value)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(parseInputValue(e.target.value, 'string'))}
                />
              </Field>
            );

          case 'boolean':
            return (
              <Field key={key} className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <Label className="text-sm font-medium text-gray-900 dark:text-white">{key}</Label>
                  {prop.description && (
                    <Description className="text-sm text-gray-500 dark:text-gray-400 mt-1">{prop.description}</Description>
                  )}
                </div>
                <Switch
                  checked={!!value}
                  onChange={(checked: boolean) => handleChange(checked)}
                  className="group relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-gray-200 transition-colors duration-200 ease-in-out data-checked:bg-indigo-600 ml-4 dark:bg-white/10 dark:data-checked:bg-indigo-500"
                >
                  <span className="pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out group-data-checked:translate-x-5" />
                </Switch>
              </Field>
            );

          case 'integer':
          case 'number':
            return (
              <Field key={key}>
                <Label className="block text-sm font-medium text-gray-900 dark:text-white">{key}</Label>
                {prop.description && (
                  <Description className="text-sm text-gray-500 dark:text-gray-400 mt-1">{prop.description}</Description>
                )}
                <Input
                  className="mt-2 block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-indigo-500"
                  type="text"
                  value={formatValueForInput(value)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(parseInputValue(e.target.value, prop.type))}
                />
              </Field>
            );

          case 'object':
            const normalizedObjValue = normalizeValue(value, 'object') || {};
            return (
              <fieldset key={key} className="rounded-lg border border-gray-200 p-4 mt-4 dark:border-gray-700">
                <legend className="text-base font-semibold text-gray-900 px-2 dark:text-white">{key}</legend>
                {prop.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{prop.description}</p>
                )}
                <RecursiveForm
                  schema={prop.properties && Object.keys(prop.properties).length > 0 ? prop.properties : inferSchemaFromValue(normalizedObjValue) }
                  formData={normalizedObjValue}
                  onChange={(newData) => handleChange(newData)}
                  level={level + 1}
                />
              </fieldset>
            );

          case 'array':
            const normalizedArrayValue = normalizeValue(value, 'array') || [];
            return (
              <fieldset key={key} className="rounded-lg border border-gray-200 p-4 mt-4 dark:border-gray-700">
                <legend className="text-base font-semibold text-gray-900 px-2 dark:text-white">{key}</legend>
                {prop.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{prop.description}</p>
                )}
                <div className="space-y-3">
                  {normalizedArrayValue.map((_: any, index: number) => {
                    let itemRaw = normalizedArrayValue[index];
                    
                    // Always try to parse strings in arrays to avoid showing JSON
                    if (typeof itemRaw === 'string') {
                      const trimmed = itemRaw.trim();
                      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                        try {
                          itemRaw = JSON.parse(trimmed);
                        } catch {
                          // Keep as string if parse fails
                        }
                      }
                    }
                    
                    const itemValue = prop.items ? normalizeValue(itemRaw, prop.items.type as string) : itemRaw;
                    const isItemObject = itemValue && typeof itemValue === 'object' && !Array.isArray(itemValue);
                    const hasItemSchema = !!(prop.items?.properties && Object.keys(prop.items.properties).length > 0);
                    
                    return (
                      <div key={index} className="flex gap-2">
                        <div className="flex-1">
                          {isItemObject ? (
                            <RecursiveForm
                              schema={hasItemSchema ? prop.items!.properties! : inferSchemaFromValue(itemValue)}
                              formData={itemValue}
                              onChange={(newData) => {
                                const newArray = [...normalizedArrayValue];
                                newArray[index] = newData;
                                handleChange(newArray);
                              }}
                              level={level + 1}
                            />
                          ) : (
                            <Input
                              className="block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-indigo-500"
                              type="text"
                              value={formatValueForInput(itemValue)}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                const newArray = [...normalizedArrayValue];
                                newArray[index] = parseInputValue(e.target.value, prop.items?.type);
                                handleChange(newArray);
                              }}
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newArray = normalizedArrayValue.filter((_: any, i: number) => i !== index);
                            handleChange(newArray);
                          }}
                          className="inline-flex items-center gap-x-1.5 rounded-md bg-red-600 px-2.5 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400"
                        >
                          <MinusCircleIcon aria-hidden="true" className="-ml-0.5 size-5" />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const newItem = prop.items?.type === 'object' ? {} : '';
                      handleChange([...normalizedArrayValue, newItem]);
                    }}
                    className="inline-flex items-center gap-x-1.5 rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    <PlusCircleIcon aria-hidden="true" className="-ml-0.5 size-5" />
                    Add Item
                  </button>
                </div>
              </fieldset>
            );

          default:
            return (
              <div key={key} className="text-sm text-gray-500 dark:text-gray-400">
                Unsupported type: {prop.type}
              </div>
            );
        }
      })}
    </div>
  );
}

export default RecursiveForm;
