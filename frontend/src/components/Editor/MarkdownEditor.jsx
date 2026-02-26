import { useEffect, useRef, useCallback } from 'react';
import EasyMDE from 'easymde';
import 'easymde/dist/easymde.min.css';
import styles from './MarkdownEditor.module.css';

export default function MarkdownEditor({ 
  value, 
  onChange, 
  placeholder,
  fileName,
  hasChanges,
  saving,
  onSave,
  onCancel
}) {
  const textareaRef = useRef(null);
  const editorRef = useRef(null);
  const isInternalChange = useRef(false);
  const toolbarRef = useRef(null);

  const handleChange = useCallback((newValue) => {
    isInternalChange.current = true;
    onChange(newValue);
    setTimeout(() => {
      isInternalChange.current = false;
    }, 0);
  }, [onChange]);

  // Update custom toolbar buttons when state changes
  useEffect(() => {
    if (toolbarRef.current) {
      const saveBtn = toolbarRef.current.querySelector('.custom-save-btn');
      const indicator = toolbarRef.current.querySelector('.custom-unsaved');
      
      if (saveBtn) {
        saveBtn.disabled = saving || !hasChanges;
        saveBtn.innerHTML = saving 
          ? '<i class="fa fa-spinner fa-spin"></i>' 
          : '<i class="fa fa-floppy-o"></i>';
      }
      if (indicator) {
        indicator.style.display = hasChanges ? 'inline' : 'none';
      }
    }
  }, [hasChanges, saving]);

  useEffect(() => {
    if (!textareaRef.current || editorRef.current) return;

    const editor = new EasyMDE({
      element: textareaRef.current,
      initialValue: value || '',
      placeholder: placeholder || 'Escribe en Markdown...',
      spellChecker: false,
      autofocus: true,
      status: false,
      toolbar: [
        'bold', 'italic', 'heading', '|',
        'quote', 'unordered-list', 'ordered-list', '|',
        'link', 'image', 'code', '|',
        'preview', 'side-by-side', 'fullscreen', '|',
        'guide'
      ],
      shortcuts: {
        togglePreview: 'Cmd-P',
        toggleSideBySide: 'F9',
        toggleFullScreen: 'F11',
      },
      sideBySideFullscreen: false,
      minHeight: '100%',
    });

    editor.codemirror.on('change', () => {
      handleChange(editor.value());
    });

    editorRef.current = editor;

    // Inject custom header into toolbar
    const toolbar = editor.gui.toolbar;
    if (toolbar && fileName) {
      toolbarRef.current = toolbar;
      
      // Create left section (file info)
      const leftSection = document.createElement('div');
      leftSection.className = styles.toolbarLeft;
      leftSection.innerHTML = `
        <span class="${styles.fileIcon}">✏️</span>
        <span class="${styles.fileName}">${fileName}</span>
        <span class="${styles.unsaved} custom-unsaved" style="display: ${hasChanges ? 'inline' : 'none'}">• Sin guardar</span>
      `;
      
      // Create right section (buttons)
      const rightSection = document.createElement('div');
      rightSection.className = styles.toolbarRight;
      
      const cancelBtn = document.createElement('button');
      cancelBtn.className = styles.iconBtn;
      cancelBtn.innerHTML = '<i class="fa fa-times"></i>';
      cancelBtn.title = 'Cancelar';
      cancelBtn.onclick = onCancel;
      
      const saveBtn = document.createElement('button');
      saveBtn.className = `${styles.saveBtn} custom-save-btn`;
      saveBtn.innerHTML = '<i class="fa fa-floppy-o"></i>';
      saveBtn.title = 'Guardar';
      saveBtn.disabled = !hasChanges;
      saveBtn.onclick = onSave;
      
      rightSection.appendChild(cancelBtn);
      rightSection.appendChild(saveBtn);
      
      // Insert at beginning and end
      toolbar.insertBefore(leftSection, toolbar.firstChild);
      toolbar.appendChild(rightSection);
      
      // Add class for flex layout
      toolbar.classList.add(styles.customToolbar);
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.toTextArea();
        editorRef.current = null;
      }
    };
  }, []);

  // Update editor when value changes externally
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      const currentValue = editorRef.current.value();
      if (value !== currentValue) {
        editorRef.current.value(value || '');
      }
    }
  }, [value]);

  return (
    <div className={styles.wrapper}>
      <textarea ref={textareaRef} />
    </div>
  );
}
