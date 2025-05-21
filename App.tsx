
import React, { useState, useEffect, useCallback } from 'react';
import { UserSettings, RecordingState, GroceryItem } from './types';
import { WHATSAPP_NUMBER_STORAGE_KEY } from './constants';
import { getStoredWhatsAppNumber, saveWhatsAppNumber as saveNumberToStorage } from './services/storageService';
import { transcribeAudioAndIdentifyGroceries } from './services/geminiService';
import { MicIcon } from './components/icons/MicIcon';
import { StopIcon } from './components/icons/StopIcon';
import { WhatsAppIcon } from './components/icons/WhatsAppIcon';
import { SettingsIcon } from './components/icons/SettingsIcon';
import { SpinnerIcon } from './components/icons/SpinnerIcon';
import { XCircleIcon } from './components/icons/XCircleIcon';
import { CheckCircleIcon } from './components/icons/CheckCircleIcon';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const App: React.FC = () => {
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [isEditingPhoneNumber, setIsEditingPhoneNumber] = useState<boolean>(false);
  const [phoneNumberInput, setPhoneNumberInput] = useState<string>('');
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [groceryList, setGroceryList] = useState<GroceryItem[]>([]);
  const [transcript, setTranscript] = useState<string>('');

  const [speechRecognition, setSpeechRecognition] = useState<any>(null);
  const [finalTranscript, setFinalTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');

  useEffect(() => {
    const storedNumber = getStoredWhatsAppNumber();
    if (storedNumber) {
      setUserSettings({ whatsAppNumber: storedNumber });
      setPhoneNumberInput(storedNumber);
    } else {
      setIsEditingPhoneNumber(true); // Force user to enter number if not found
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognitionInstance = new SpeechRecognitionAPI();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'hi-IN'; // Hindi

      recognitionInstance.onresult = (event: any) => {
        let final = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setFinalTranscript(prev => prev + final);
        setInterimTranscript(interim);
      };
      
      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setErrorMessage(`Speech recognition error: ${event.error}. Please ensure microphone access is allowed.`);
        setRecordingState(RecordingState.ERROR);
        if (speechRecognition) speechRecognition.stop();
      };

      recognitionInstance.onend = () => {
        // Only transition out of LISTENING if explicitly stopped by user or error
        if (recordingState === RecordingState.LISTENING) {
           // This might happen if recognition stops unexpectedly.
           // Could add logic to auto-restart or just rely on user to stop.
           // For now, if it ends while LISTENING, assume it was an unexpected stop.
        }
      };
      setSpeechRecognition(recognitionInstance);
    } else {
      setErrorMessage("Speech recognition not supported by this browser.");
      setRecordingState(RecordingState.ERROR);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  const handleSavePhoneNumber = () => {
    if (phoneNumberInput.trim() && /^\+?[1-9]\d{1,14}$/.test(phoneNumberInput.trim())) {
      const newNumber = phoneNumberInput.trim();
      saveNumberToStorage(newNumber);
      setUserSettings({ whatsAppNumber: newNumber });
      setIsEditingPhoneNumber(false);
      setErrorMessage(null);
    } else {
      setErrorMessage("Please enter a valid WhatsApp number with country code (e.g., +91XXXXXXXXXX).");
    }
  };

  const startListening = useCallback(async () => {
    if (!speechRecognition) {
      setErrorMessage("Speech recognition is not initialized.");
      setRecordingState(RecordingState.ERROR);
      return;
    }
    if (!userSettings?.whatsAppNumber) {
      setIsEditingPhoneNumber(true);
      setErrorMessage("Please set your WhatsApp number first.");
      return;
    }
    setErrorMessage(null);
    setGroceryList([]);
    setTranscript('');
    setFinalTranscript('');
    setInterimTranscript('');
    setRecordingState(RecordingState.REQUESTING_PERMISSION);

    try {
      // Mic permission is implicitly handled by browser when starting speech recognition
      await navigator.mediaDevices.getUserMedia({ audio: true }); // Check permission
      speechRecognition.start();
      setRecordingState(RecordingState.LISTENING);
    } catch (err) {
      console.error("Error starting speech recognition:", err);
      setErrorMessage("Microphone access denied or microphone not found. Please check browser permissions.");
      setRecordingState(RecordingState.ERROR);
    }
  }, [speechRecognition, userSettings]);

  const stopListeningAndProcess = useCallback(async () => {
    if (speechRecognition && recordingState === RecordingState.LISTENING) {
      speechRecognition.stop();
    }
    setRecordingState(RecordingState.PROCESSING);
    
    // The final transcript is already accumulated in `finalTranscript`
    const fullTranscript = finalTranscript + interimTranscript; // Capture any last interim bits
    setTranscript(fullTranscript);
    setInterimTranscript(''); // Clear interim after stopping

    if (!fullTranscript.trim()) {
      setErrorMessage("No speech detected. Please try again.");
      setRecordingState(RecordingState.IDLE);
      return;
    }

    try {
      const items = await transcribeAudioAndIdentifyGroceries(fullTranscript);
      setGroceryList(items.map((item, index) => ({ id: `item-${index}-${Date.now()}`, name: item })));
      setRecordingState(RecordingState.SHOWING_LIST);
      if (items.length === 0) {
        setErrorMessage("No specific grocery items identified in the conversation.");
      }
    } catch (error: any) {
      console.error("Error processing audio:", error);
      setErrorMessage(error.message || "Failed to process audio and identify groceries. Please try again.");
      setRecordingState(RecordingState.ERROR);
    }
  }, [speechRecognition, recordingState, finalTranscript, interimTranscript]);

  const sendToWhatsApp = () => {
    if (groceryList.length === 0 || !userSettings?.whatsAppNumber) return;
    const message = `Hello! Here's the grocery list from our conversation:\n\n${groceryList.map(item => `- ${item.name}`).join('\n')}\n\nPowered by Grocery Listener AI.`;
    const whatsappUrl = `https://wa.me/${userSettings.whatsAppNumber.replace('+', '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const resetApp = () => {
    setRecordingState(RecordingState.IDLE);
    setGroceryList([]);
    setErrorMessage(null);
    setTranscript('');
    setFinalTranscript('');
    setInterimTranscript('');
  };

  const renderContent = () => {
    if (!userSettings || isEditingPhoneNumber) {
      return (
        <div className="w-full max-w-md p-6 bg-white dark:bg-gray-800 rounded-xl shadow-2xl space-y-6">
          <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-white">Welcome!</h2>
          <p className="text-center text-gray-600 dark:text-gray-300">Please enter your WhatsApp number to get started. We'll use this to send you your grocery lists.</p>
          <div>
            <label htmlFor="whatsappNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">WhatsApp Number (with country code)</label>
            <input
              type="tel"
              id="whatsappNumber"
              value={phoneNumberInput}
              onChange={(e) => setPhoneNumberInput(e.target.value)}
              placeholder="+91XXXXXXXXXX"
              className="mt-1 block w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          {errorMessage && (
            <div className="flex items-center p-3 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 rounded-lg">
              <XCircleIcon className="w-5 h-5 text-red-500 dark:text-red-300 mr-2 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-200">{errorMessage}</p>
            </div>
          )}
          <button
            onClick={handleSavePhoneNumber}
            className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors duration-150"
          >
            Save Number
          </button>
        </div>
      );
    }

    return (
      <div className="w-full max-w-2xl p-6 md:p-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Grocery Listener</h1>
          <button
            onClick={() => { setIsEditingPhoneNumber(true); setErrorMessage(null); }}
            className="p-2 text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
            aria-label="Edit WhatsApp Number"
          >
            <SettingsIcon className="w-6 h-6" />
          </button>
        </div>
        
        {errorMessage && recordingState === RecordingState.ERROR && (
             <div className="flex items-start p-4 bg-red-100 dark:bg-red-900 border-l-4 border-red-500 dark:border-red-700 rounded-md shadow-sm">
                <XCircleIcon className="w-6 h-6 text-red-500 dark:text-red-300 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                    <h3 className="text-md font-semibold text-red-800 dark:text-red-200">Error</h3>
                    <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
                </div>
            </div>
        )}
        {errorMessage && recordingState !== RecordingState.ERROR && groceryList.length === 0 && (
             <div className="flex items-start p-4 bg-yellow-100 dark:bg-yellow-900 border-l-4 border-yellow-500 dark:border-yellow-700 rounded-md shadow-sm">
                <XCircleIcon className="w-6 h-6 text-yellow-500 dark:text-yellow-300 mr-3 flex-shrink-0 mt-0.5" /> {/* Using XCircle, could be Info icon */}
                <div>
                    <h3 className="text-md font-semibold text-yellow-800 dark:text-yellow-200">Notice</h3>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">{errorMessage}</p>
                </div>
            </div>
        )}


        <div className="text-center space-y-4">
          {recordingState === RecordingState.IDLE && (
            <button
              onClick={startListening}
              className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-full shadow-lg transform hover:scale-105 transition-all duration-150 ease-in-out flex items-center justify-center mx-auto"
              aria-label="Start Listening"
            >
              <MicIcon className="w-6 h-6 mr-2" />
              Start Listening
            </button>
          )}

          {recordingState === RecordingState.REQUESTING_PERMISSION && (
            <div className="text-center py-4">
              <SpinnerIcon className="w-12 h-12 text-indigo-500 animate-spin mx-auto" />
              <p className="mt-3 text-gray-600 dark:text-gray-300">Requesting microphone access...</p>
            </div>
          )}

          {recordingState === RecordingState.LISTENING && (
            <>
              <button
                onClick={stopListeningAndProcess}
                className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-full shadow-lg transform hover:scale-105 transition-all duration-150 ease-in-out flex items-center justify-center mx-auto"
                aria-label="Stop Listening"
              >
                <StopIcon className="w-6 h-6 mr-2" />
                Stop Listening
              </button>
              <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg min-h-[60px]">
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">Listening... Say something in Hindi.</p>
                {interimTranscript && <p className="text-gray-700 dark:text-gray-200">{finalTranscript} <span className="text-gray-400 dark:text-gray-500">{interimTranscript}</span></p>}
                {!interimTranscript && finalTranscript && <p className="text-gray-700 dark:text-gray-200">{finalTranscript}</p>}
              </div>
            </>
          )}

          {recordingState === RecordingState.PROCESSING && (
            <div className="text-center py-4">
              <SpinnerIcon className="w-12 h-12 text-indigo-500 animate-spin mx-auto" />
              <p className="mt-3 text-gray-600 dark:text-gray-300">Processing your conversation...</p>
            </div>
          )}
        </div>

        {transcript && (recordingState === RecordingState.SHOWING_LIST || recordingState === RecordingState.ERROR) && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Full Transcript (Hindi):</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{transcript}</p>
          </div>
        )}

        {recordingState === RecordingState.SHOWING_LIST && groceryList.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center p-3 bg-green-100 dark:bg-green-900 border border-green-400 dark:border-green-700 rounded-lg">
                <CheckCircleIcon className="w-5 h-5 text-green-500 dark:text-green-300 mr-2 flex-shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-200">Grocery list generated successfully!</p>
            </div>
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">Your Grocery List:</h2>
            <ul className="list-disc list-inside pl-5 space-y-2 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow">
              {groceryList.map((item) => (
                <li key={item.id} className="text-lg">{item.name}</li>
              ))}
            </ul>
            <button
              onClick={sendToWhatsApp}
              className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-md text-white bg-green-500 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 dark:focus:ring-offset-gray-800 transition-colors duration-150"
            >
              <WhatsAppIcon className="w-5 h-5 mr-2" />
              Send to WhatsApp
            </button>
          </div>
        )}
        
        {(recordingState === RecordingState.SHOWING_LIST || recordingState === RecordingState.ERROR ) && (
            <button
                onClick={resetApp}
                className="w-full mt-4 px-6 py-3 border border-gray-300 dark:border-gray-600 text-base font-medium rounded-lg shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors duration-150"
            >
                Start New List
            </button>
        )}

      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-800 dark:via-purple-800 dark:to-pink-800 p-4 selection:bg-indigo-200 dark:selection:bg-indigo-700">
      {renderContent()}
      <footer className="mt-8 text-center text-sm text-white dark:text-gray-300 opacity-75">
        <p>&copy; {new Date().getFullYear()} Grocery Listener AI. Powered by Gemini.</p>
      </footer>
    </div>
  );
};

export default App;
    