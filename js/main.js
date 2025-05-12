/**
 * main.js - Logica principale e gestione eventi Piano Future.
 *
 * Piano Future
 * Copyright (c) 2025 Lorenzetti Giuseppe
 *
 * Questo codice sorgente è rilasciato sotto la licenza MIT.
 * Vedi il file LICENSE nel repository GitHub per i dettagli completi.
 * https://github.com/thc792/piano-tutor-extraime/blob/main/LICENSE
 */

/**
 * js/main.js
 * **VERSIONE CON 5 RIPETIZIONI, SCROLLING CORRETTO, E AVANZAMENTO SEQUENZIALE BASATO SU CONTEGGIO NOTE**
 * Scrolling automatico costante verso il basso, non alterato dalla selezione delle note.
 */

import { renderExercise } from './vexflow_renderer.js';
import { initializeMIDI } from './midi_handler.js';

// --- Costanti e Riferimenti DOM ---
const categorySelect = document.getElementById('category-select');
const exerciseSelect = document.getElementById('exercise-select');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');
const pauseButton = document.getElementById('pause-button');
const theoryButton = document.getElementById('theory-button');
const scoreDiv = document.getElementById('score');
const scoreDivId = 'score';
const midiStatusSpan = document.getElementById('midi-status');
const successRateSpan = document.getElementById('success-rate');
const expectedNoteSpan = document.getElementById('expected-note');
const playedNoteSpan = document.getElementById('played-note');
const scrollSpeedControl = document.getElementById('scroll-speed');
const scrollSpeedValueSpan = document.getElementById('scroll-speed-value');

// --- Stato Applicazione ---
let allExercises = {};
let currentExerciseDefinition = null;
let currentExerciseData = null;
let isPlaying = false;
let isPaused = false;
let midiReady = false;
let exerciseCompletionTimeout = null;

// --- Stato Avanzamento Esercizio ---
let totalNotesPerRepetition = 0;
let correctNotesThisRepetition = 0;
let currentRepetition = 1;
const DEFAULT_TARGET_REPETITIONS = 5;
let targetRepetitions = DEFAULT_TARGET_REPETITIONS;

// --- Stato Scrolling ---
let scrollInterval = null;
let scrollSpeed = 1;
const SCROLL_INTERVAL_MS = 400;
const SCROLL_PIXELS_PER_INTERVAL_BASE = 0.5;

// --- URL Pagina Teoria ---
const THEORY_PAGE_URL = "https://www.pianohitech.com/teoria-blues";

// --- Funzioni Inizializzazione e Caricamento Dati ---
function loadExerciseData() {
    if (window.exerciseData) {
        allExercises = window.exerciseData;
        console.log("Dati degli esercizi caricati.");
    } else {
        console.error("Errore critico: window.exerciseData non trovato.");
        alert("Errore caricamento esercizi.");
    }
    populateCategorySelect();
}

function populateCategorySelect() {
    const categories = Object.keys(allExercises);
    categorySelect.innerHTML = '<option value="">-- Seleziona Categoria --</option>';
    categories.forEach(catKey => {
        if (Array.isArray(allExercises[catKey]) && allExercises[catKey].length > 0 && allExercises[catKey].some(ex => ex && ex.id)) {
            const option = document.createElement('option');
            option.value = catKey;
            option.textContent = catKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            categorySelect.appendChild(option);
        } else {
            console.warn(`Categoria "${catKey}" ignorata (vuota o senza esercizi validi).`);
        }
    });
}

function populateExerciseSelect(categoryKey) {
    exerciseSelect.innerHTML = '<option value="">-- Seleziona Esercizio --</option>';
    exerciseSelect.disabled = true;

    if (categoryKey && allExercises[categoryKey] && Array.isArray(allExercises[categoryKey])) {
        const exercises = allExercises[categoryKey];
        let hasValidExercises = false;
        exercises.forEach(ex => {
            if (ex && ex.id) {
                const option = document.createElement('option');
                option.value = ex.id;
                option.textContent = ex.name || ex.id;
                exerciseSelect.appendChild(option);
                hasValidExercises = true;
            }
        });
        exerciseSelect.disabled = !hasValidExercises;
        if (!hasValidExercises) exerciseSelect.innerHTML = '<option value="">-- Nessun esercizio valido --</option>';
    } else if (categoryKey) {
        exerciseSelect.innerHTML = '<option value="">-- Errore Categoria --</option>';
    }

    resetUIState();
    scoreDiv.innerHTML = '<p>Seleziona un esercizio per iniziare.</p>';
    startButton.disabled = true; pauseButton.disabled = true; theoryButton.disabled = false;
    currentExerciseData = null; currentExerciseDefinition = null;
    totalNotesPerRepetition = 0;
}

function selectExercise(exerciseId, categoryKey) {
    if (!exerciseId || !categoryKey || !allExercises[categoryKey] || !Array.isArray(allExercises[categoryKey])) {
        console.warn("Selezione esercizio non valida:", exerciseId, categoryKey);
        currentExerciseData = null; currentExerciseDefinition = null; totalNotesPerRepetition = 0;
        startButton.disabled = true; pauseButton.disabled = true; theoryButton.disabled = false;
        scoreDiv.innerHTML = '<p>Selezione non valida.</p>';
        resetUIState();
        return;
    }

    currentExerciseDefinition = allExercises[categoryKey].find(ex => ex && ex.id === exerciseId);

    if (currentExerciseDefinition) {
        console.log("Esercizio selezionato:", currentExerciseDefinition.name || currentExerciseDefinition.id);
        currentExerciseData = JSON.parse(JSON.stringify(currentExerciseDefinition));
        
        targetRepetitions = currentExerciseDefinition.repetitions || DEFAULT_TARGET_REPETITIONS;
        console.log(`Target ripetizioni per questo esercizio: ${targetRepetitions}`);

        totalNotesPerRepetition = 0;
        let hasPlayableNotes = false;
        ['notes', 'notesTreble', 'notesBass'].forEach(key => {
            if (currentExerciseData[key]?.length) {
                currentExerciseData[key].forEach(noteObj => {
                    if (noteObj && !(noteObj.keys && noteObj.keys[0]?.toLowerCase().startsWith('r/'))) {
                        hasPlayableNotes = true;
                        if (typeof noteObj.midiValue === 'number') totalNotesPerRepetition++;
                        else if (Array.isArray(noteObj.midiValues)) totalNotesPerRepetition += noteObj.midiValues.length;
                    }
                });
            }
        });
        console.log(`Note suonabili per ripetizione: ${totalNotesPerRepetition}`);

        resetNoteStatesAndRepetition();
        highlightPendingNotes();
        renderExercise(scoreDivId, currentExerciseData);
        scoreDiv.scrollTop = 0; // Scrolla all'inizio quando si seleziona un NUOVO esercizio

        startButton.disabled = !midiReady || !hasPlayableNotes;
        pauseButton.disabled = true; theoryButton.disabled = false;
        resetUIState();
        stopButton.disabled = true;

        if (!midiReady) updateInfo("Collega MIDI.");
        else if (!hasPlayableNotes) updateInfo("Nessuna nota da suonare.");
        else updateInfo("MIDI pronto. Premi Start.");
    } else {
        console.error(`Errore: Esercizio ID "${exerciseId}" non trovato.`);
        currentExerciseData = null; currentExerciseDefinition = null; totalNotesPerRepetition = 0;
        startButton.disabled = true; pauseButton.disabled = true; theoryButton.disabled = false;
        scoreDiv.innerHTML = '<p>Errore caricamento esercizio.</p>';
        resetUIState();
    }
}

// --- Gestione Stato Esercizio ---
function resetNoteStatesAndRepetition() {
    if (!currentExerciseData) return;
    correctNotesThisRepetition = 0;
    currentRepetition = 1;

    ['notes', 'notesTreble', 'notesBass'].forEach(key => {
        if (currentExerciseData[key]?.length) {
            currentExerciseData[key].forEach(noteObj => {
                if (noteObj) {
                    if (noteObj.keys && noteObj.keys[0]?.toLowerCase().startsWith('r/')) noteObj.status = 'rest';
                    else if (typeof noteObj.midiValue === 'number' || noteObj.midiValues?.length) {
                        noteObj.status = 'pending';
                        if (Array.isArray(noteObj.midiValues)) noteObj.correctMidiValues = [];
                    } else noteObj.status = 'ignored';
                }
            });
        }
    });
}

function highlightPendingNotes() {
    if (!currentExerciseData) return;
    let firstExpectedText = `Rip. ${currentRepetition}/${targetRepetitions}. Suona...`;
    let foundFirst = false;

    const processArray = (notesArray) => {
        if (!notesArray) return;
        notesArray.forEach(noteObj => {
            if (noteObj?.status === 'pending') {
                noteObj.status = 'expected';
                if (Array.isArray(noteObj.midiValues)) noteObj.correctMidiValues = [];
                if (!foundFirst) {
                    if (noteObj.keys) firstExpectedText = `Rip. ${currentRepetition}/${targetRepetitions}. Atteso: ${noteObj.keys.join(', ')}`;
                    else if (Array.isArray(noteObj.midiValues)) firstExpectedText = `Rip. ${currentRepetition}/${targetRepetitions}. Atteso: Accordo (${noteObj.midiValues.join(', ')})`;
                    else if (typeof noteObj.midiValue === 'number') firstExpectedText = `Rip. ${currentRepetition}/${targetRepetitions}. Atteso: Nota MIDI ${noteObj.midiValue}`;
                    foundFirst = true;
                }
            }
        });
    };
    processArray(currentExerciseData.notesBass);
    processArray(currentExerciseData.notesTreble);
    processArray(currentExerciseData.notes);
    updateInfo(firstExpectedText);
}

// --- Gestione Scrolling Automatico ---
function startScrolling() {
    console.log("Avvio scrolling automatico...");
    if (scrollInterval) clearInterval(scrollInterval);

    if (scoreDiv.scrollHeight <= scoreDiv.clientHeight) {
        console.warn("Contenuto non scrollabile. Scrolling non avviato.");
        return;
    }
    // Scrolla all'inizio solo se è l'inizio della prima nota della prima ripetizione,
    // o all'inizio di una nuova ripetizione (dopo la pausa tra ripetizioni).
    // E non se si sta riprendendo dalla pausa.
    if (correctNotesThisRepetition === 0 && !isPaused) {
        scoreDiv.scrollTop = 0;
        console.log("Scrollato all'inizio per inizio esercizio/ripetizione.");
    }

    scrollInterval = setInterval(() => {
        const pixelsToScroll = SCROLL_PIXELS_PER_INTERVAL_BASE * scrollSpeed;
        scoreDiv.scrollTop += pixelsToScroll;
        const scrollableHeight = scoreDiv.scrollHeight - scoreDiv.clientHeight;
        if (scoreDiv.scrollTop >= scrollableHeight - pixelsToScroll) {
             scoreDiv.scrollTop = scrollableHeight;
             stopScrolling();
             console.log("Scrolling automatico fermato: Raggiunta la fine.");
        }
    }, SCROLL_INTERVAL_MS);
}

function stopScrolling() {
    console.log("Arresto scrolling automatico.");
    if (scrollInterval) {
        clearInterval(scrollInterval);
        scrollInterval = null;
    }
}

function pauseExercise() {
    if (!isPlaying || isPaused) return;
    isPaused = true;
    stopScrolling();
    startButton.disabled = true;
    pauseButton.textContent = "Resume"; pauseButton.disabled = false;
    stopButton.disabled = false; theoryButton.disabled = false;
    updateInfo("Esercizio in Pausa.");
}

function resumeExercise() {
    if (!isPlaying || !isPaused) return;
    isPaused = false;
    startScrolling(); // Riprende lo scrolling da dove era
    startButton.disabled = true;
    pauseButton.textContent = "Pause"; pauseButton.disabled = false;
    stopButton.disabled = false; theoryButton.disabled = true;
    highlightPendingNotes(); // Potrebbe essere necessario ri-evidenziare
    // Non è detto sia necessario renderizzare di nuovo qui, dipende se lo stato delle note è cambiato
    // renderExercise(scoreDivId, currentExerciseData);
}

function handleTheoryClick() {
    window.open(THEORY_PAGE_URL, '_blank');
}

// --- Funzioni di Controllo Esercizio ---
function startExercise() {
    if (!currentExerciseData || !midiReady || totalNotesPerRepetition === 0 || isPlaying) {
         console.warn("Impossibile avviare.");
         return;
    }
    if (exerciseCompletionTimeout) clearTimeout(exerciseCompletionTimeout);
    
    resetNoteStatesAndRepetition();
    console.log(`Avvio Esercizio: ${currentExerciseDefinition.name || currentExerciseDefinition.id} - Ripetizione ${currentRepetition}/${targetRepetitions}`);

    isPlaying = true; isPaused = false;
    startButton.disabled = true; pauseButton.disabled = false; pauseButton.textContent = "Pause";
    stopButton.disabled = false; categorySelect.disabled = true; exerciseSelect.disabled = true;
    theoryButton.disabled = true;
    updateSuccessRate();
    playedNoteSpan.textContent = '--';

    highlightPendingNotes();
    renderExercise(scoreDivId, currentExerciseData);
    // Lo scroll all'inizio (scrollTop=0) è gestito da startScrolling se correctNotesThisRepetition === 0
    setTimeout(startScrolling, 200);
}

function stopExercise() {
    if (!isPlaying && stopButton.disabled) return;
    if (exerciseCompletionTimeout) clearTimeout(exerciseCompletionTimeout);
    stopScrolling();
    isPlaying = false; isPaused = false;

    if (currentExerciseData) {
        resetNoteStatesAndRepetition();
        renderExercise(scoreDivId, currentExerciseData);
        scoreDiv.scrollTop = 0; // Scrolla sempre all'inizio quando si preme Stop
    } else {
        scoreDiv.innerHTML = '<p>Nessun esercizio attivo.</p>';
    }
    startButton.disabled = !midiReady || !currentExerciseData || totalNotesPerRepetition === 0;
    pauseButton.disabled = true; pauseButton.textContent = "Pause";
    stopButton.disabled = true; categorySelect.disabled = false; exerciseSelect.disabled = false;
    theoryButton.disabled = false;
    updateInfo("Esercizio interrotto.");
    playedNoteSpan.textContent = '--';
}

function resetUIState() {
    isPlaying = false; isPaused = false;
    successRateSpan.textContent = '-- %';
    updateInfo("-- Seleziona o avvia --");
    playedNoteSpan.textContent = '--';
    stopButton.disabled = true; pauseButton.disabled = true; pauseButton.textContent = "Pause";
    theoryButton.disabled = false;
    if (exerciseCompletionTimeout) clearTimeout(exerciseCompletionTimeout);
}

function updateSuccessRate() {
    if (!currentExerciseData || totalNotesPerRepetition === 0) {
         successRateSpan.textContent = totalNotesPerRepetition === 0 ? 'N/A' : '-- %';
         return;
    }
    const percentage = ((correctNotesThisRepetition / totalNotesPerRepetition) * 100).toFixed(1);
    successRateSpan.textContent = `${percentage} %`;
}

function updateInfo(message) {
    expectedNoteSpan.textContent = message;
}

// --- Gestione Input MIDI (Con Ripetizioni) ---
function handleNoteOn(noteName, midiNote, velocity) {
    playedNoteSpan.textContent = `${noteName} (MIDI: ${midiNote})`;
    playedNoteSpan.style.color = '';

    if (!isPlaying || isPaused || !currentExerciseData) return;

    console.log(`MIDI In: ${noteName} (${midiNote}) | Rip: ${currentRepetition}/${targetRepetitions} | Corr: ${correctNotesThisRepetition}/${totalNotesPerRepetition}`);

    let noteMatchedAndMarked = false;

    const findAndMarkFirstNote = (notesArray, arrayName) => {
        if (noteMatchedAndMarked || !notesArray) return;
        for (let noteObj of notesArray) {
            if (noteObj?.status === 'expected') {
                if (typeof noteObj.midiValue === 'number' && noteObj.midiValue === midiNote) {
                    noteObj.status = 'correct'; correctNotesThisRepetition++; noteMatchedAndMarked = true;
                    console.log(`   [${arrayName}] OK Nota singola ${noteName}. Conteggio: ${correctNotesThisRepetition}/${totalNotesPerRepetition}`);
                    return;
                } else if (Array.isArray(noteObj.midiValues) && noteObj.midiValues.includes(midiNote)) {
                    if (!noteObj.correctMidiValues) noteObj.correctMidiValues = [];
                    if (!noteObj.correctMidiValues.includes(midiNote)) {
                        noteObj.correctMidiValues.push(midiNote); correctNotesThisRepetition++; noteMatchedAndMarked = true;
                        console.log(`   [${arrayName}] OK Nota ${noteName} accordo. Note: ${noteObj.correctMidiValues.length}/${noteObj.midiValues.length}. Tot: ${correctNotesThisRepetition}/${totalNotesPerRepetition}`);
                        if (noteObj.correctMidiValues.length >= noteObj.midiValues.length) {
                            noteObj.status = 'correct'; console.log(`   -> Accordo in ${arrayName} completato!`);
                        }
                        return;
                    }
                }
            }
        }
    };

    findAndMarkFirstNote(currentExerciseData.notesBass, 'Bass');
    if (!noteMatchedAndMarked) findAndMarkFirstNote(currentExerciseData.notesTreble, 'Treble');
    if (!noteMatchedAndMarked) findAndMarkFirstNote(currentExerciseData.notes, 'Single');

    if (noteMatchedAndMarked) {
        updateInfo(`OK: ${noteName}`);
        updateSuccessRate();
        
        // Salva e ripristina la posizione di scroll per evitare salti durante il re-render
        const savedScrollTop = scoreDiv.scrollTop;
        renderExercise(scoreDivId, currentExerciseData);
        scoreDiv.scrollTop = savedScrollTop; // RIPRISTINA SCROLL

        if (correctNotesThisRepetition >= totalNotesPerRepetition) {
            console.log(`--- Ripetizione ${currentRepetition} di ${targetRepetitions} completata! ---`);
            if (currentRepetition < targetRepetitions) {
                currentRepetition++;
                correctNotesThisRepetition = 0;
                 ['notes', 'notesTreble', 'notesBass'].forEach(key => {
                    if (currentExerciseData[key]?.length) {
                        currentExerciseData[key].forEach(noteObj => {
                            if (noteObj && noteObj.status !== 'rest' && noteObj.status !== 'ignored') {
                                noteObj.status = 'pending';
                                if (Array.isArray(noteObj.midiValues)) noteObj.correctMidiValues = [];
                            }
                        });
                    }
                });
                updateInfo(`Ottimo! Prepara Rip. ${currentRepetition}`);
                // Non fermare lo scrolling qui, lascialo continuare se non è alla fine
                // stopScrolling(); // Rimosso
                setTimeout(() => {
                    if (!isPlaying || isPaused) return;
                    highlightPendingNotes();
                    const savedScrollTopNewRep = scoreDiv.scrollTop; // Salva prima di render
                    renderExercise(scoreDivId, currentExerciseData);
                    scoreDiv.scrollTop = savedScrollTopNewRep; // Ripristina
                    updateSuccessRate();
                    // Lo scroll all'inizio per la nuova ripetizione è gestito da startScrolling
                    // scoreDiv.scrollTop = 0; // Rimosso, gestito da startScrolling
                    setTimeout(startScrolling, 100); // Riavvia/continua lo scrolling
                }, 1500);
            } else {
                console.log("--- TUTTE LE RIPETIZIONI COMPLETATE ---");
                handleExerciseCompletion();
            }
        } else {
            highlightPendingNotes();
        }
    } else {
        console.log(`   Nota ${noteName} (${midiNote}) non attesa.`);
        updateInfo(`Errore: ${noteName} non atteso`);
        playedNoteSpan.style.color = 'red';
    }
}

// --- Exercise Completion and Advancement Handling (SEQUENTIAL) ---
function handleExerciseCompletion() {
    console.log("[handleExerciseCompletion] Tutte le ripetizioni finite. Avanzamento sequenziale.");
    stopScrolling(); // Ferma lo scrolling alla fine di tutte le ripetizioni
    isPlaying = false; isPaused = false;
    stopButton.disabled = true; pauseButton.disabled = true; pauseButton.textContent = "Pause";
    updateInfo("Esercizio Completato!");
    playedNoteSpan.textContent = "Bravo!";

    const currentCategoryKey = categorySelect.value;
    const currentExerciseId = currentExerciseDefinition?.id;

    if (!currentCategoryKey || !allExercises[currentCategoryKey] || !currentExerciseId || !Array.isArray(allExercises[currentCategoryKey])) {
        console.error("[handleExerciseCompletion] Stato non valido per avanzamento.");
        categorySelect.disabled = false; exerciseSelect.disabled = false;
        startButton.disabled = !midiReady; theoryButton.disabled = false;
        return;
    }

    const categoryExercises = allExercises[currentCategoryKey];
    let nextExercise = null;

    console.log(`[handleExerciseCompletion] Cerco esercizio successivo a "${currentExerciseId}" in "${currentCategoryKey}".`);
    const currentIndex = categoryExercises.findIndex(ex => ex && ex.id === currentExerciseId);

    if (currentIndex !== -1 && currentIndex < categoryExercises.length - 1) {
         let nextIndex = currentIndex + 1;
         while(nextIndex < categoryExercises.length && (!categoryExercises[nextIndex] || !categoryExercises[nextIndex].id)) {
            console.warn(`[handleExerciseCompletion] Salto indice ${nextIndex} (non valido).`);
            nextIndex++;
         }
         if (nextIndex < categoryExercises.length) {
            nextExercise = categoryExercises[nextIndex];
            console.log(`[handleExerciseCompletion] Prossimo (seq): ${nextExercise.name || nextExercise.id}`);
         } else {
            console.log("[handleExerciseCompletion] Nessun esercizio valido dopo l'indice corrente.");
         }
    } else {
        console.log("[handleExerciseCompletion] Ultimo esercizio della categoria o errore indice.");
    }

    if (nextExercise && nextExercise.id) {
        const delay = 2000;
        updateInfo(`Prossimo: ${nextExercise.name || nextExercise.id}...`);
        console.log(`[handleExerciseCompletion] Attendo ${delay}ms per ${nextExercise.id}`);
        categorySelect.disabled = true; exerciseSelect.disabled = true;
        startButton.disabled = true; pauseButton.disabled = true; stopButton.disabled = true; theoryButton.disabled = true;

        exerciseCompletionTimeout = setTimeout(() => {
            exerciseCompletionTimeout = null;
            console.log(`[handleExerciseCompletion] Timeout: Carico ${nextExercise.id}`);
            exerciseSelect.value = nextExercise.id;
            selectExercise(nextExercise.id, currentCategoryKey); // Questo chiamerà renderExercise e scrollTop=0

            if (midiReady && currentExerciseData && totalNotesPerRepetition > 0) {
                 console.log("[handleExerciseCompletion] Avvio automatico...");
                 setTimeout(startExercise, 200); // startExercise chiamerà startScrolling
            } else {
                 console.warn("[handleExerciseCompletion] Avvio automatico fallito.");
                 theoryButton.disabled = false;
                 if (!midiReady) updateInfo(`Prossimo: ${nextExercise.name || nextExercise.id}. Collega MIDI.`);
                 else if (totalNotesPerRepetition === 0) updateInfo(`Prossimo: ${nextExercise.name || nextExercise.id}. Nessuna nota suonabile.`);
                 else updateInfo(`Prossimo: ${nextExercise.name || nextExercise.id}. Premi Start.`);
            }
        }, delay);
    } else {
        console.log("[handleExerciseCompletion] Fine categoria o nessun prossimo esercizio trovato.");
        updateInfo("Categoria Completata! Scegli una nuova categoria.");
        playedNoteSpan.textContent = "Ottimo Lavoro!";
        categorySelect.disabled = false; exerciseSelect.disabled = false;
        startButton.disabled = true;
        currentExerciseData = null; currentExerciseDefinition = null; totalNotesPerRepetition = 0;
    }
}

// --- updateMidiStatus Function ---
function updateMidiStatus(message, isConnected) {
    midiStatusSpan.textContent = message;
    midiReady = isConnected;

    if (isConnected) {
        startButton.disabled = isPlaying || !currentExerciseData || totalNotesPerRepetition === 0;
        pauseButton.disabled = !isPlaying || isPaused;
        theoryButton.disabled = isPlaying && !isPaused;
        if (!isPlaying && currentExerciseData && totalNotesPerRepetition > 0) {
             updateInfo(`MIDI pronto. Premi Start per ${currentExerciseDefinition.name || currentExerciseDefinition.id}.`);
        } else if (!currentExerciseData) {
             updateInfo("MIDI pronto. Seleziona un esercizio.");
        }
    } else {
        startButton.disabled = true; pauseButton.disabled = true; stopButton.disabled = true;
        theoryButton.disabled = true;
        updateInfo("Collega un dispositivo MIDI per iniziare.");
        if (isPlaying) {
            console.warn("MIDI disconnesso durante l'esecuzione!");
            stopExercise();
            alert("ATTENZIONE: Dispositivo MIDI disconnesso! Esercizio interrotto.");
            updateInfo("MIDI Disconnesso! Esercizio interrotto.");
        }
    }
}

// --- Event Listeners ---
categorySelect.addEventListener('change', (e) => { populateExerciseSelect(e.target.value); });
exerciseSelect.addEventListener('change', (e) => { selectExercise(e.target.value, categorySelect.value); });
startButton.addEventListener('click', startExercise);
stopButton.addEventListener('click', stopExercise);
pauseButton.addEventListener('click', () => { if (isPaused) resumeExercise(); else pauseExercise(); });
theoryButton.addEventListener('click', handleTheoryClick);

// --- Application Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM caricato. Inizializzazione Piano Future (5 Rip, Scroll Corretto, Seq)...");
    loadExerciseData();
    initializeMIDI(handleNoteOn, updateMidiStatus);
    resetUIState();
    scoreDiv.innerHTML = '<p>Benvenuto! Seleziona una categoria e un esercizio.</p>';
    updateInfo("Collega un dispositivo MIDI e seleziona un esercizio.");

    scrollSpeedValueSpan.textContent = scrollSpeedControl.value;
    scrollSpeed = parseInt(scrollSpeedControl.value, 10);
    scrollSpeedControl.addEventListener('input', (e) => {
        scrollSpeed = parseInt(e.target.value, 10);
        scrollSpeedValueSpan.textContent = e.target.value;
        console.log(`Velocità scrolling aggiornata: ${scrollSpeed}`);
    });
});