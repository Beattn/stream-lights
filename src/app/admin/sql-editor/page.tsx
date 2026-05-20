'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SQLEditorPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setRowCount(0);

    try {
      const token = prompt('Enter SQL Editor Token (or leave blank for dev mode):');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/sql/execute', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Unknown error');
      } else {
        setResult(data.data);
        setRowCount(data.rowCount || 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute query');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResult(null);
    setError(null);
    setRowCount(0);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">SQL Editor</h1>
          <p className="text-muted-foreground mt-2">Execute raw SQL queries for database management</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Query Editor</CardTitle>
            <CardDescription>Write your SQL query below (SELECT, UPDATE, INSERT, CREATE TABLE, etc.)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SELECT * FROM triggers LIMIT 10;"
              className="w-full h-48 p-4 border rounded-lg font-mono text-sm bg-slate-950 text-white"
            />

            <div className="flex gap-2">
              <Button onClick={handleExecute} disabled={loading || !query.trim()} className="flex-1">
                {loading ? 'Executing...' : 'Execute Query'}
              </Button>
              <Button onClick={handleClear} variant="outline">
                Clear
              </Button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                <p className="font-semibold">Error:</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
              <CardDescription>Query returned {rowCount} row{rowCount !== 1 ? 's' : ''}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <pre className="bg-slate-950 text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-96 font-mono">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Common Queries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              onClick={() => setQuery('SELECT * FROM triggers LIMIT 10;')}
              className="text-left w-full p-3 bg-slate-100 hover:bg-slate-200 rounded border text-sm"
            >
              Get all triggers
            </button>
            <button
              onClick={() => setQuery('SELECT * FROM commands LIMIT 10;')}
              className="text-left w-full p-3 bg-slate-100 hover:bg-slate-200 rounded border text-sm"
            >
              Get all commands
            </button>
            <button
              onClick={() =>
                setQuery(
                  `ALTER TABLE triggers ADD COLUMN audio_url TEXT; ALTER TABLE triggers ADD COLUMN audio_volume INTEGER DEFAULT 100;`
                )
              }
              className="text-left w-full p-3 bg-slate-100 hover:bg-slate-200 rounded border text-sm"
            >
              Add audio columns to triggers
            </button>
            <button
              onClick={() =>
                setQuery(
                  `ALTER TABLE commands ADD COLUMN audio_url TEXT; ALTER TABLE commands ADD COLUMN audio_volume INTEGER DEFAULT 100;`
                )
              }
              className="text-left w-full p-3 bg-slate-100 hover:bg-slate-200 rounded border text-sm"
            >
              Add audio columns to commands
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
