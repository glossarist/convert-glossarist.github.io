import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fileSave } from 'browser-fs-access';

import type { Convertor } from 'common';

import styles from './app.module.css';
import { convertors, parse } from './convertors.js';


type Upload = (FileSystemFileEntry | FileSystemDirectoryEntry)[];


const encoder = new TextEncoder();


const App: React.FC<Record<never, never>> = function () {
  const [convertorName, setConvertorName] =
    useState<keyof typeof convertors>(Object.keys(convertors)[0]);

  const [_log, setLog] = useState<string[]>([]);

  function log(msg: string) {
    setLog(log => [ ...log, msg ]);
  }

  async function handleDrop(upload: Upload) {
    if (upload) {
      setLog([`Using convertor ${convertorName}`]);
      const results = [];
      try {
        for await (const concept of parse(convertorName, upload, log)) {
          results.push(concept);
        }
      } catch (e) {
        log(`Failed to process upload: ${(e as any).toString?.()}`);
      }
      if (results.length > 0) {
        log(`${results.length} terminology records obtained, exporting to JSON…`);
        fileSave(new Blob(
          [encoder.encode(JSON.stringify(results))],
          { type: 'application/json' },
        ), {
          fileName: `glossarist-${convertorName}-conversion-result.json`,
        });
      } else {
        log("No results obtained.");
      }
    }
  }

  function handleConvertorSelect(evt: React.FormEvent<HTMLSelectElement>) {
    const convertorName = evt.currentTarget.value;
    setConvertorName(convertorName);
  }

  return (
    <div className={styles.app}>
      <h1 className={styles.header}>Convert concepts to Glossarist format</h1>
      <div
          className={styles.convertorSelector}>
        <p>
          Select the desired convertor and drop files below.
          Download will be initiated when conversion is complete.
        </p>
        <p>
          Selected convertor:
          &emsp;
          <select onChange={handleConvertorSelect} value={convertorName}>
            {Object.entries(convertors).map(([_convertorName, convertor]) =>
              <option
                key={_convertorName}
                value={_convertorName}
                label={`${_convertorName} (${convertor.label})`}
              />
            )}
          </select>
        </p>
      </div>
      <div className={styles.drop}>
        {convertors[convertorName]
          ? <DropReceiver
              className={styles.spanFull}
              onDrop={handleDrop}
            />
          : undefined}
        <div className={styles.log}>
          {convertors[convertorName]
            ? _log.length > 0
              ? _log.map(msg => <div>{msg}</div>)
              : <>
                  <em>{convertors[convertorName].inputDescription}</em>
                  can&nbsp;be dragged&nbsp;into this&nbsp;area
                </>
            : <>No convertor is available.</>}
        </div>
      </div>
    </div>
  );
};


const Convertor: React.FC<{
  convertor: Convertor<any, any>;
}> = function({ convertor }) {
  return (
    <div className={styles.convertor}>
      <strong>{convertor.label}</strong>
      &ensp;
      <span>Please provide: {convertor.inputDescription ?? '(no description)'}</span>
    </div>
  );
}


const DropReceiver: React.FC<{
  onDrop: (input: Upload) => void;
  prompt?: JSX.Element;
  className?: string;
}> = function ({ onDrop, prompt, className }) {
  function handleDragOver(evt: React.DragEvent) {
    evt.preventDefault();
  }
  function handleDrop(evt: React.DragEvent) {
    evt.preventDefault();
    const uploads = [...evt.dataTransfer.items].
      map(i => i.webkitGetAsEntry()).
      filter(e => e !== null && (e.isFile || e.isDirectory)) as Upload;
    onDrop(uploads);
  }
  return (
    <div
        className={className}
        onDragOver={handleDragOver}
        onDrop={handleDrop}>
      {prompt ?? <>&nbsp;</>}
    </div>
  );
};


export function renderApp(el: Element) {
  return createRoot(el).render(<App />);
}
