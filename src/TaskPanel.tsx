import { PlaceMap } from './PlaceMap';
import { safeUrl } from './tools';
import type { TaskSnapshot, TableData, GeneratedFile } from './task-types';
import { tableData } from './documents';

export function downloadFile(file: GeneratedFile) {
  const url = URL.createObjectURL(new Blob([file.content], { type: `${file.mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const labels: Record<string, string> = {
  'capabilities.list': 'List capabilities',
  'conversation.rename': 'Rename conversation',
  'currency.convert': 'Convert currency',
  'currency.rates': 'Exchange rates',
  'calculator.evaluate': 'Calculate',
  'calculator.adjust': 'Apply arithmetic operation',
  'github.search': 'Find repositories',
  'github.read_file': 'Read repository file',
  'documents.read': 'Read attachment',
  'documents.search': 'Find relevant passages',
  'documents.extract': 'Extract fields',
  'table.query': 'Process table',
  'date.calculate': 'Calculate date',
  'date.convert': 'Convert timezone',
  'file.create': 'Prepare download',
  'file.export_results': 'Export completed results',
  'weather.forecast': 'Check forecast',
  'places.search': 'Find place',
  'wikipedia.search': 'Search Wikipedia',
  'ip.lookup': 'Look up IP',
  'website.read': 'Read website',
  'datetime.now': 'Check clock',
};

export function TaskPanel({ task }: { task: TaskSnapshot }) {
  const files = task.steps.flatMap((s) => (s.result?.artifact ? [s.result.artifact] : []));
  const sources = task.steps.flatMap((s) => s.result?.sources || []);
  let table: TableData | undefined;
  for (const step of task.steps) {
    const data = step.result?.data;
    if (data && typeof data === 'object' && !Array.isArray(data) && data.table) {
      try {
        table = tableData(data.table);
      } catch {
        /* Ignore malformed old stored tables. */
      }
    }
  }
  return (
    <section className="task-panel" aria-label="Task progress">
      <details
        open={task.status === 'running' || task.status === 'partial' || task.status === 'stopped'}
      >
        <summary>
          {task.workflow || 'Task'} · {task.status} ·{' '}
          {task.steps.filter((s) => s.status === 'done').length}/{task.steps.length} steps completed
        </summary>
        {task.planningCalls !== undefined && (
          <p className="task-model-calls">Local AI planning calls: {task.planningCalls}</p>
        )}
        {task.scope ? (
          <details>
            <summary>Local AI scope</summary>
            <pre>{JSON.stringify(task.scope, null, 2)}</pre>
          </details>
        ) : null}
        {task.instructions?.length ? (
          <details>
            <summary>Local AI instructions</summary>
            <ol>
              {task.instructions.map((instruction, i) => (
                <li key={i}>{instruction}</li>
              ))}
            </ol>
          </details>
        ) : null}
        {task.plan?.length ? (
          <details>
            <summary>Local AI plan</summary>
            <ol>
              {task.plan.map((step, i) => (
                <li key={i}>
                  {step.tool}: {step.purpose}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        <ol className="task-steps">
          {task.steps.map((step) => (
            <li key={step.id} className={`task-step ${step.status}`}>
              <strong>
                {labels[step.tool] || step.tool} · {step.status}
              </strong>
              <span>{step.summary.replace(/\*\*/g, '')}</span>
              <details>
                <summary>Arguments and result</summary>
                <pre>
                  {JSON.stringify(
                    { tool: step.tool, args: step.args, data: step.result?.data },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </li>
          ))}
        </ol>
        {task.note && <p>{task.note}</p>}
      </details>
      {table && (
        <div className="task-table">
          <table>
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, 8).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell === null ? '—' : String(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {table.rows.length} rows{table.rows.length > 8 ? ' · showing first 8' : ''}
          </p>
        </div>
      )}
      {files.map((file, i) => (
        <details key={`preview-${i}`}>
          <summary>Preview {file.name}</summary>
          <pre>
            {file.content.slice(0, 6000)}
            {file.content.length > 6000 ? '\n[Preview truncated]' : ''}
          </pre>
        </details>
      ))}
      {files.map((file, i) => (
        <button
          type="button"
          className="artifact-download"
          key={i}
          onClick={() => downloadFile(file)}
        >
          Download {file.name}
        </button>
      ))}
      {sources
        .filter((source) => source.location)
        .map((source, i) => (
          <PlaceMap key={i} location={source.location} title={source.title} />
        ))}
      {sources.length > 0 && (
        <details className="task-sources">
          <summary>Sources and excerpts ({sources.length})</summary>
          {sources.map((source, i) =>
            safeUrl(source.url) ? (
              <a
                className="source-card"
                href={safeUrl(source.url)}
                target="_blank"
                rel="noopener noreferrer"
                key={i}
              >
                <strong>{source.title}</strong>
                <p>{source.detail}</p>
              </a>
            ) : (
              <div className="source-card" key={i}>
                <strong>{source.title}</strong>
                <p>{source.detail}</p>
              </div>
            ),
          )}
        </details>
      )}
    </section>
  );
}
