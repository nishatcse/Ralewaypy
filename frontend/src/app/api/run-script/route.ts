import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

// Define a global variable to store the active Python process if it's app.py
declare global {
  var activePythonProcess: ChildProcess | null;
}
global.activePythonProcess = null;


const ALLOWED_SCRIPTS = ['app.py', 'scheduler.py', 'config_updater.py', 'test_auth.py'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scriptName, args = [] } = body;

    if (typeof scriptName !== 'string' || !ALLOWED_SCRIPTS.includes(scriptName)) {
      return NextResponse.json({ error: 'Invalid or not allowed script name provided.' }, { status: 400 });
    }

    if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string' || typeof arg === 'number')) {
      return NextResponse.json({ error: 'Invalid arguments provided. Must be an array of strings or numbers.' }, { status: 400 });
    }
    
    const scriptArgs = args.map(String);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendEvent = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        const child = spawn('python3', [scriptName, ...scriptArgs], {
          cwd: '/opt/python-scripts/', // Updated CWD for Docker
          stdio: ['pipe', 'pipe', 'pipe'], // pipe for stdin, stdout, stderr
        });

        // If it's app.py, store it globally for potential interaction
        if (scriptName === 'app.py') {
          if (global.activePythonProcess) {
            console.warn("An existing app.py process was active. Killing it.");
            global.activePythonProcess.kill();
          }
          global.activePythonProcess = child;
        }
        
        let stdoutBuffer = '';
        child.stdout.on('data', (data) => {
          stdoutBuffer += data.toString();
          let newlineIndex;
          while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
            const line = stdoutBuffer.substring(0, newlineIndex).trim();
            stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);
            if (line) {
              try {
                const jsonData = JSON.parse(line);
                if (jsonData && jsonData.action === 'PROMPT_USER') {
                  sendEvent('prompt', jsonData);
                } else {
                  // If it's valid JSON but not a prompt, send as structured output
                  sendEvent('output', { type: 'stdout_json', data: jsonData });
                }
              } catch (e) {
                // Not JSON, send as plain text line
                sendEvent('output', { type: 'stdout', line: line });
              }
            }
          }
        });

        let stderrBuffer = '';
        child.stderr.on('data', (data) => {
          stderrBuffer += data.toString();
          let newlineIndex;
          while ((newlineIndex = stderrBuffer.indexOf('\n')) >= 0) {
            const line = stderrBuffer.substring(0, newlineIndex).trim();
            stderrBuffer = stderrBuffer.substring(newlineIndex + 1);
            if (line) {
              sendEvent('output', { type: 'stderr', line: line });
            }
          }
        });

        child.on('error', (error) => {
          console.error(`Failed to start script: ${scriptName}`, error);
          sendEvent('error', { message: `Failed to start script: ${error.message}` });
          if (scriptName === 'app.py' && global.activePythonProcess === child) {
            global.activePythonProcess = null;
          }
          controller.close();
        });

        child.on('close', (code) => {
          // Process any remaining buffered output
          if (stdoutBuffer.trim()) {
             sendEvent('output', { type: 'stdout', line: stdoutBuffer.trim() });
             stdoutBuffer = ''; // Clear buffer
          }
          if (stderrBuffer.trim()) {
             sendEvent('output', { type: 'stderr', line: stderrBuffer.trim() });
             stderrBuffer = ''; // Clear buffer
          }

          sendEvent('done', { success: code === 0, code: code });
          if (scriptName === 'app.py' && global.activePythonProcess === child) {
            global.activePythonProcess = null;
          }
          controller.close();
        });
      },
      cancel(reason) {
        console.log('Stream cancelled by client:', reason);
        // If there's an active process associated with this stream (app.py), kill it.
        if (global.activePythonProcess && scriptName === 'app.py') { // Check scriptName to be sure
            // Potentially, one could store child in the stream's context if not using global.
            // For now, this relies on global.activePythonProcess being the one for this stream.
            // This simple check is okay as long as only one app.py is meant to be active.
            console.log(`Killing active app.py process (PID: ${global.activePythonProcess.pid}) due to stream cancellation.`);
            global.activePythonProcess.kill();
            global.activePythonProcess = null;
        }
        // For other scripts, they might not be stored in global.activePythonProcess
        // A more robust system would map controller instances to child processes.
        // However, the prompt specified storing 'app.py' in a global.
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Error in run-script API setup:', error);
    // This catch is for errors during initial request processing, before stream starts.
    if (error instanceof SyntaxError) { // e.g. bad JSON in request
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to process request setup' }, { status: 500 });
  }
}
