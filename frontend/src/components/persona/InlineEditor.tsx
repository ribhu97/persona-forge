import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Check, X, Edit3 } from 'lucide-react';

interface InlineEditorProps {
  value: string;
  onSave: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  editClassName?: string;
  displayClassName?: string;
  disabled?: boolean;
}

export function InlineEditor({
  value,
  onSave,
  onCancel,
  placeholder = "Click to edit",
  multiline = false,
  className,
  editClassName,
  displayClassName,
  disabled = false
}: InlineEditorProps) {
  if (typeof value === 'object' && value !== null) {
    console.error('InlineEditor received object value:', value);
    return <span className="text-red-500 text-xs">Invalid value</span>;
  }

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value || '');
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      } else if (inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (disabled) return;
    setIsEditing(true);
    setEditValue(value || '');
  };

  const handleSave = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue !== value) {
      onSave(trimmedValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value || '');
    setIsEditing(false);
    onCancel?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleBlur = () => {
    // Small delay to allow clicking save/cancel buttons
    setTimeout(() => {
      if (isEditing) {
        handleSave();
      }
    }, 150);
  };

  if (isEditing) {
    const InputComponent = multiline ? 'textarea' : 'input';

    return (
      <div className={cn("relative", className)}>
        <InputComponent
          ref={inputRef as any}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={cn(
            "w-full bg-background border border-primary rounded px-2 py-1 text-sm",
            "focus:outline-none focus:ring-1 focus:ring-primary",
            multiline && "min-h-[3rem] resize-none",
            editClassName
          )}
        />

        <div className="flex items-center gap-1 mt-1">
          <button
            onMouseDown={(e) => e.preventDefault()} // Prevent blur
            onClick={handleSave}
            className="p-1 hover:bg-green-100 hover:text-green-700 rounded transition-colors"
            title="Save"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()} // Prevent blur
            onClick={handleCancel}
            className="p-1 hover:bg-red-100 hover:text-red-700 rounded transition-colors"
            title="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleStartEdit}
      className={cn(
        "group relative cursor-pointer rounded px-1 py-0.5 transition-colors",
        !disabled && "hover:bg-accent/50",
        disabled && "cursor-default",
        value || placeholder ? "" : "min-h-[1.5rem]",
        displayClassName,
        className
      )}
      title={disabled ? "" : "Click to edit"}
    >
      {typeof value === 'string' ? value : JSON.stringify(value) || (
        <span className="text-muted-foreground italic">
          {placeholder}
        </span>
      )}

      {!disabled && (
        <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-50 absolute -top-1 -right-1 transition-opacity" />
      )}
    </div>
  );
}

// Array editor for lists like goals, frustrations, etc.
interface ArrayEditorProps {
  values: string[];
  onUpdate: (values: string[]) => void;
  placeholder?: string;
  maxItems?: number;
  disabled?: boolean;
  className?: string;
}

export function ArrayEditor({
  values,
  onUpdate,
  placeholder = "Add item",
  maxItems = 10,
  disabled = false,
  className
}: ArrayEditorProps) {
  const [newItem, setNewItem] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddItem = () => {
    const trimmed = newItem.trim();
    if (trimmed && values.length < maxItems) {
      onUpdate([...values, trimmed]);
      setNewItem('');
      setIsAdding(false);
    }
  };

  const handleUpdateItem = (index: number, newValue: string) => {
    const updatedValues = [...values];
    updatedValues[index] = newValue;
    onUpdate(updatedValues);
  };

  const handleRemoveItem = (index: number) => {
    onUpdate(values.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    } else if (e.key === 'Escape') {
      setNewItem('');
      setIsAdding(false);
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      {values.map((item, index) => (
        <div key={index} className="flex items-start gap-2 group">
          <span className="text-muted-foreground mt-1.5">•</span>
          <div className="flex-1">
            <InlineEditor
              value={item}
              onSave={(newValue) => handleUpdateItem(index, newValue)}
              disabled={disabled}
              className="flex-1"
            />
          </div>
          {!disabled && (
            <button
              onClick={() => handleRemoveItem(index)}
              className="opacity-0 group-hover:opacity-50 hover:opacity-100 p-0.5 hover:bg-red-100 hover:text-red-700 rounded transition-all text-xs"
              title="Remove item"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}

      {!disabled && values.length < maxItems && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">•</span>
          {isAdding ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(() => setIsAdding(false), 150)}
                placeholder={placeholder}
                className="flex-1 bg-background border border-primary rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleAddItem}
                className="p-1 hover:bg-green-100 hover:text-green-700 rounded transition-colors"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors italic"
            >
              {placeholder}
            </button>
          )}
        </div>
      )}
    </div>
  );
}