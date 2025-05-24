'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';

interface Settings {
  [key: string]: string;
}

const CONFIG_KEYS = [
  'MOBILE_NUMBER', 
  'PASSWORD', 
  'FROM_CITY', 
  'TO_CITY', 
  'DATE_OF_JOURNEY', 
  'SEAT_CLASS', 
  'TRAIN_NUMBER', 
  'MAX_SELECTABLE_SEAT', 
  'DESIRED_SEATS', 
  'TARGET_TIME'
];

export default function HomePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formSettings, setFormSettings] = useState<Settings>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);

  // State for "Book Tickets Now" (app.py) functionality with SSE
  const [scriptOutput, setScriptOutput] = useState<Array<{ type: string, content: string | object }>>([]);
  const [isScriptRunning, setIsScriptRunning] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<{ key: string, prompt: string, type: string } | null>(null);
  const [userInput, setUserInput] = useState<string>('');
  const [eventSourceInstance, setEventSourceInstance] = useState<EventSource | null>(null);


  // State for "Schedule Booking" functionality
  const [targetTimeInput, setTargetTimeInput] = useState<string>(''); // User input for scheduler.py
  const [scheduleOutput, setScheduleOutput] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // State for "Test Authentication" functionality
  const [authTestOutput, setAuthTestOutput] = useState<string | null>(null);
  const [isTestingAuth, setIsTestingAuth] = useState(false);
  const [authTestError, setAuthTestError] = useState<string | null>(null);

  const initializeFormSettings = useCallback((currentSettings: Settings | null) => {
    const initialForm: Settings = {};
    CONFIG_KEYS.forEach(key => {
      initialForm[key] = currentSettings?.[key] || '';
    });
    // Specifically handle password if it's the masked value from GET
    if (currentSettings?.PASSWORD === '********') {
      initialForm.PASSWORD = '********';
    }
    setFormSettings(initialForm);
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/settings');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch settings: ${response.status}`);
      }
      const data: Settings = await response.json();
      setSettings(data);
      initializeFormSettings(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred');
      setSettings(null);
      initializeFormSettings(null); // Initialize with empty fields if fetch fails
    } finally {
      setIsLoading(false);
    }
  }, [initializeFormSettings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitSuccessMessage(null);
    setSubmitErrorMessage(null);

    // Prepare payload: if password is '********', don't send it unless it was changed from an actual password.
    // The API handles '********' as "do not change".
    // If formSettings.PASSWORD is '********' and settings.PASSWORD (original) was also '********', it's fine.
    // If formSettings.PASSWORD is '********' but settings.PASSWORD was something else, it means user typed '********'.
    // For simplicity, the API is designed to ignore '********' for PASSWORD updates, so we can send it as is.
    const payload = { ...formSettings };

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to update settings: ${response.status}`);
      }
      
      setSubmitSuccessMessage('Settings updated successfully!');
      await fetchSettings(); // Re-fetch settings to display updated values and re-initialize form
    } catch (err: any) {
      setSubmitErrorMessage(err.message || 'An unknown error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestAuth = async () => {
    setIsTestingAuth(true);
    setAuthTestOutput(null);
    setAuthTestError(null);

    try {
      const response = await fetch('/api/run-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptName: 'test_auth.py' }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Failed to run authentication test script: ${response.status}`);
      }
      
      setAuthTestOutput(result.output);
      if (!result.success) {
        setAuthTestError(result.error || "Authentication test script executed but reported an error. Check output for details.");
      }

    } catch (err: any) {
      setAuthTestError(err.message || 'An unknown error occurred while trying to run the authentication test script.');
      setAuthTestOutput(null);
    } finally {
      setIsTestingAuth(false);
    }
  };

  const handleScheduleBooking = async () => {
    // Validate targetTimeInput format (HH:MM:SS)
    if (!/^\d{2}:\d{2}:\d{2}$/.test(targetTimeInput)) {
      setScheduleError('Invalid Target Time format. Please use HH:MM:SS (e.g., 08:00:00).');
      setScheduleOutput(null);
      return;
    }

    setIsScheduling(true);
    setScheduleOutput(null);
    setScheduleError(null);

    try {
      const response = await fetch('/api/run-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptName: 'scheduler.py', args: [targetTimeInput] }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Failed to run scheduling script: ${response.status}`);
      }
      
      setScheduleOutput(result.output);
      if (!result.success) {
        setScheduleError(result.error || "Scheduling script executed but reported an error. Check output for details.");
      }

    } catch (err: any) {
      setScheduleError(err.message || 'An unknown error occurred while trying to run the scheduling script.');
      setScheduleOutput(null);
    } finally {
      setIsScheduling(false);
    }
  };

  const handleBookTicketsNow = () => {
    if (isScriptRunning) {
      // Optionally, implement a cancel button that calls eventSourceInstance.close()
      // and potentially a backend endpoint to kill the script if needed.
      // For now, this button just prevents starting a new one if one is running.
      console.log("Script is already running.");
      return;
    }

    setScriptOutput([]);
    setScriptError(null);
    setCurrentPrompt(null);
    setUserInput('');
    setIsScriptRunning(true);

    if (eventSourceInstance) {
      eventSourceInstance.close();
    }

    // Assuming the SSE endpoint is at /api/run-script-sse (GET)
    const newEventSource = new EventSource('/api/run-script-sse?scriptName=app.py');
    setEventSourceInstance(newEventSource);

    newEventSource.addEventListener('output', (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        setScriptOutput(prev => [...prev, { 
          type: parsedData.type, 
          content: parsedData.line || parsedData.data 
        }]);
      } catch (e) {
        console.error("Failed to parse output event data:", e);
        setScriptOutput(prev => [...prev, { type: 'raw', content: event.data }]);
      }
    });

    newEventSource.addEventListener('prompt', (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        setCurrentPrompt(parsedData);
        setUserInput(''); // Clear previous user input
      } catch (e) {
        console.error("Failed to parse prompt event data:", e);
        setScriptError("Received an invalid prompt from the server.");
      }
    });

    newEventSource.addEventListener('done', (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        if (!parsedData.success) {
          setScriptError(`Script exited with code ${parsedData.code}. Check output for details.`);
        } else {
           // Optionally set a success message or clear scriptError if it was previously set
           // For now, just ensure error is null on success.
           setScriptError(null);
        }
      } catch (e) {
        console.error("Failed to parse done event data:", e);
        setScriptError("Received an invalid completion signal from the server.");
      } finally {
        setIsScriptRunning(false);
        setCurrentPrompt(null); // Clear prompt on done
        newEventSource.close();
        setEventSourceInstance(null);
      }
    });

    newEventSource.addEventListener('error', (event) => {
      console.error('SSE Error:', event);
      // Attempt to parse error if data is present, otherwise show generic message
      let errorMessage = "Connection error or script failed to start.";
      if ((event as MessageEvent).data) {
          try {
              const parsedError = JSON.parse((event as MessageEvent).data);
              errorMessage = parsedError.message || errorMessage;
          } catch (e) {
              // Keep default error message
          }
      }
      setScriptError(errorMessage);
      setIsScriptRunning(false);
      setCurrentPrompt(null);
      newEventSource.close();
      setEventSourceInstance(null);
    });
  };

  const handlePromptInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserInput(e.target.value);
  };

  const handleSubmitInput = async () => {
    if (!currentPrompt || userInput.trim() === '') return;

    try {
      const response = await fetch('/api/provide-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: userInput }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit input.');
      }
      // Input submitted, clear prompt and input field. Script will send next output/prompt.
      setCurrentPrompt(null);
      setUserInput('');
      setScriptError(null); // Clear previous input submission errors
    } catch (err: any) {
      setScriptError(`Failed to submit input: ${err.message}`);
    }
  };
  
  // Cleanup EventSource on component unmount
  useEffect(() => {
    return () => {
      if (eventSourceInstance) {
        eventSourceInstance.close();
      }
    };
  }, [eventSourceInstance]);


  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-center text-gray-800">
            Bangladesh Railway Booking System - Control Panel
          </h1>
        </header>

        <section className="mb-8 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Current Configuration</h2>
          {isLoading && <p className="text-gray-600">Loading settings...</p>}
          {error && <p className="text-red-500">Error: {error}</p>}
          {settings && !isLoading && !error && (
            <dl className="divide-y divide-gray-200">
              {Object.entries(settings).length > 0 ? (
                Object.entries(settings).map(([key, value]) => (
                  <div key={key} className="py-3 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    <dt className="text-sm font-medium text-gray-600 break-all">{key}</dt>
                    <dd className="text-sm text-gray-900 md:col-span-2 break-all">{value}</dd>
                  </div>
                ))
              ) : (
                <p className="text-gray-600">No settings found or .env file is empty/not found.</p>
              )}
            </dl>
          )}
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Update Configuration Section */}
            <div className="p-6 border border-gray-200 rounded-lg bg-white shadow-md col-span-1 md:col-span-2">
              <h3 className="text-xl font-semibold text-blue-700 mb-4">Update Configuration</h3>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {CONFIG_KEYS.map(key => (
                  <div key={key}>
                    <label htmlFor={key} className="block text-sm font-medium text-gray-700 capitalize">
                      {key.replace(/_/g, ' ').toLowerCase()}
                    </label>
                    <input
                      type={key === 'PASSWORD' ? 'password' : 'text'}
                      id={key}
                      name={key}
                      value={formSettings[key] || ''}
                      onChange={handleFormChange}
                      placeholder={key === 'PASSWORD' ? 'Enter new password or leave as ********' : `Enter ${key.toLowerCase().replace(/_/g, ' ')}`}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      disabled={isLoading} // Disable form inputs while initial settings are loading
                    />
                    {key === 'PASSWORD' && settings?.PASSWORD && formSettings.PASSWORD === '********' && (
                       <p className="text-xs text-gray-500 mt-1">Password is currently set (masked). Type to change.</p>
                    )}
                     {key === 'PASSWORD' && !settings?.PASSWORD && formSettings.PASSWORD === '' && (
                       <p className="text-xs text-gray-500 mt-1">Password is not set.</p>
                    )}
                  </div>
                ))}
                <button
                  type="submit"
                  disabled={isSubmitting || isLoading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                >
                  {isSubmitting ? 'Updating...' : 'Update Settings'}
                </button>
                {submitSuccessMessage && <p className="text-green-600 text-sm mt-2">{submitSuccessMessage}</p>}
                {submitErrorMessage && <p className="text-red-600 text-sm mt-2">{submitErrorMessage}</p>}
              </form>
            </div>

            {/* Book Tickets Now Section */}
            <div className="p-6 border border-gray-200 rounded-lg bg-white shadow-md">
              <h3 className="text-xl font-semibold text-green-700 mb-4">Book Tickets Now</h3>
              <p className="text-sm text-gray-600 mb-3">
                Run the `app.py` script to attempt booking tickets based on the current configuration.
              </p>
              <button
                onClick={handleBookTicketsNow}
                disabled={(isScriptRunning && !currentPrompt) || isSubmitting || isLoading} // Disable if running AND no prompt
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400"
              >
                {isScriptRunning && !currentPrompt ? 'Booking Process Running...' : 'Run Booking Script (app.py)'}
              </button>
              
              {(isScriptRunning && !currentPrompt) && (
                <div className="mt-4 text-center">
                  <p className="text-green-600">Booking process is running... Please wait for output or a prompt.</p>
                </div>
              )}

              {currentPrompt && (
                <div className="mt-4 p-4 border border-blue-300 rounded-md bg-blue-50">
                  <label htmlFor="interactiveInput" className="block text-sm font-medium text-blue-700 mb-2">
                    {currentPrompt.prompt} ({currentPrompt.key})
                  </label>
                  <input
                    type={currentPrompt.type === 'password' ? 'password' : 'text'}
                    id="interactiveInput"
                    value={userInput}
                    onChange={handlePromptInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                  <button
                    onClick={handleSubmitInput}
                    disabled={userInput.trim() === ''}
                    className="mt-2 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                  >
                    Submit Input
                  </button>
                </div>
              )}

              {scriptError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700 font-semibold">Error:</p>
                  <p className="text-sm text-red-600">{scriptError}</p>
                </div>
              )}

              {scriptOutput.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold text-gray-700 mb-2">Script Output:</h4>
                  <div className="bg-gray-900 text-white text-sm p-4 rounded-md overflow-x-auto max-h-96">
                    {scriptOutput.map((item, index) => (
                      <div key={index} className={item.type === 'stderr' ? 'text-red-400' : ''}>
                        {typeof item.content === 'object' ? JSON.stringify(item.content) : item.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Schedule Booking Section */}
            <div className="p-6 border border-gray-200 rounded-lg bg-white shadow-md">
              <h3 className="text-xl font-semibold text-purple-700 mb-4">Schedule Booking</h3>
              <p className="text-sm text-gray-600 mb-3">
                Run the `scheduler.py` script to attempt booking at a specified time.
                The `TARGET_TIME` in the configuration above will be overridden by the value entered here for this run.
              </p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="targetTimeInput" className="block text-sm font-medium text-gray-700">
                    Target Time (HH:MM:SS):
                  </label>
                  <input
                    type="text"
                    id="targetTimeInput"
                    name="targetTimeInput"
                    value={targetTimeInput}
                    onChange={(e) => setTargetTimeInput(e.target.value)}
                    placeholder="e.g., 08:00:00"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                    disabled={isScheduling || isScriptRunning || isSubmitting || isLoading}
                  />
                </div>
                <button
                  onClick={handleScheduleBooking}
                  disabled={isScheduling || isScriptRunning || isSubmitting || isLoading || !targetTimeInput}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:bg-gray-400"
                >
                  {isScheduling ? 'Scheduling Process Running...' : 'Run Scheduling Script (scheduler.py)'}
                </button>
              </div>
              
              {isScheduling && (
                <div className="mt-4 text-center">
                  <p className="text-purple-600">Scheduling process is running... Please wait.</p>
                </div>
              )}

              {scheduleError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700 font-semibold">Error Running Scheduler:</p>
                  <p className="text-sm text-red-600">{scheduleError}</p>
                </div>
              )}

              {scheduleOutput && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold text-gray-700 mb-2">Scheduler Output:</h4>
                  <pre className="bg-gray-900 text-white text-sm p-4 rounded-md overflow-x-auto max-h-96">
                    {scheduleOutput}
                  </pre>
                </div>
              )}
            </div>

            {/* Test Authentication Section */}
            <div className="p-6 border border-gray-200 rounded-lg bg-white shadow-md">
              <h3 className="text-xl font-semibold text-red-700 mb-4">Test Authentication</h3>
              <p className="text-sm text-gray-600 mb-3">
                Run the `test_auth.py` script to verify login credentials and session validity.
              </p>
              <button
                onClick={handleTestAuth}
                disabled={isTestingAuth || isScheduling || isScriptRunning || isSubmitting || isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400"
              >
                {isTestingAuth ? 'Testing Authentication...' : 'Run Authentication Test (test_auth.py)'}
              </button>
              
              {isTestingAuth && (
                <div className="mt-4 text-center">
                  <p className="text-red-600">Testing authentication... Please wait.</p>
                </div>
              )}

              {authTestError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700 font-semibold">Error Running Auth Test:</p>
                  <p className="text-sm text-red-600">{authTestError}</p>
                </div>
              )}

              {authTestOutput && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold text-gray-700 mb-2">Auth Test Output:</h4>
                  <pre className="bg-gray-900 text-white text-sm p-4 rounded-md overflow-x-auto max-h-96">
                    {authTestOutput}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} BRBS Control Panel. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
