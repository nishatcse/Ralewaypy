import { NextRequest, NextResponse } from 'next/server';
import { ChildProcess } from 'child_process';

// Ensure the global variable is declared for TypeScript if not already in a global .d.ts file
// This was already declared in run-script/route.ts, so it should be available.
// declare global {
//   var activePythonProcess: ChildProcess | null;
// }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { value } = body;

    if (typeof value !== 'string') {
      return NextResponse.json({ error: 'Invalid input value provided. Must be a string.' }, { status: 400 });
    }

    if (!global.activePythonProcess || global.activePythonProcess.killed) {
      return NextResponse.json({ error: 'No active script is currently running or waiting for input.' }, { status: 404 });
    }

    // Check if stdin is writable
    // The stdin type is Writable | null. We need to ensure it's not null and is writable.
    // ChildProcess.stdin is a Writable stream.
    const activeProcess = global.activePythonProcess as ChildProcess; // Type assertion for clarity
    
    if (!activeProcess.stdin || !activeProcess.stdin.writable) {
      console.error('Error: activePythonProcess.stdin is null or not writable.');
      // Attempting to write might throw an error or fail silently.
      // It's also possible the process ended right before this check.
      return NextResponse.json({ error: 'Script input stream is not available or not writable.' }, { status: 500 });
    }

    try {
      activeProcess.stdin.write(value + '\n', (error) => {
        if (error) {
          // This callback is for errors during the write operation itself.
          console.error('Failed to write to stdin:', error);
          // Note: Cannot send a response here as one might have already been sent or headers committed.
          // This error is logged server-side. If the write fails, the Python script might hang or error out,
          // which should be handled by its error reporting via SSE.
        }
      });
      // It's important to note that `stdin.write` is asynchronous.
      // We send the success response optimistically. If an error occurs during write,
      // it will be logged on the server. The Python script might then fail or hang,
      // and that failure would ideally be communicated back via its stderr stream through SSE.
      return NextResponse.json({ message: 'Input submitted successfully' });

    } catch (e: any) {
      // This catch block is for synchronous errors that might occur before or during the call to write,
      // though less common for stdin.write if the stream object itself is valid.
      console.error('Exception while writing to stdin:', e);
      return NextResponse.json({ error: `Failed to write to script input: ${e.message}` }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error in provide-input API:', error);
    if (error instanceof SyntaxError) { // e.g. bad JSON in request
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to process input request' }, { status: 500 });
  }
}
