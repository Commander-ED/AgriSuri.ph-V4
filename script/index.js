// ============================================================
// index.js — Main Logic ng AgriSuri PH Farmer Dashboard
// Ginagamit ng index.html
// ============================================================

// ── SUPABASE CONFIG ───────────────────────────────────────────
// Ito ang connection sa ating cloud database (Supabase)
// Dito naka-save ang lahat ng detections, users, at alerts
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://qyiqodoqvavrqfddaxbn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_T-usxsctS9q0qHvvw-_FJA_rxOtH1yN';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── ROBOFLOW CONFIG ───────────────────────────────────────────
// Ito ang API ng ating AI model para sa Rice disease detection
// Accuracy: 98.2% — mas accurate kaysa sa Teachable Machine
const RF_API_KEY  = 'J9uM5hNHsDX6bmTbwsoh';
const RF_MODEL_ID = 'rice-leaf-disease-twtlz/1';
const RF_URL      = `https://classify.roboflow.com/${RF_MODEL_ID}`;

// ── GLOBAL STATE ──────────────────────────────────────────────
// Mga variable na ginagamit sa buong app
let currentUser  = null;  // Naka-login na user object mula sa Supabase
let currentCrop  = 'rice'; // Piniling crop: 'rice' o 'tomato'
let tmModel      = null;  // Teachable Machine model (offline fallback)
let isCameraOn   = false; // Kung naka-on ang camera
let videoStream  = null;  // Camera video stream object

// ── INIT ──────────────────────────────────────────────────────
// Tinatawag agad pagkakarga ng page
// Sinisigurado na naka-login ang user bago ipakita ang dashboard
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();    // I-verify ang login session
    await loadWeather();  // I-load ang weather data
    await loadDashboardStats(); // I-load ang detection statistics
    loadTMModel(currentCrop);   // I-load ang Teachable Machine model
    setupNavigation();    // I-setup ang sidebar navigation
    setupLogout();        // I-setup ang logout button
});

// ── FUNCTION: checkAuth() ─────────────────────────────────────
// Sinisigurado na may naka-login na user
// Kung walang session — ire-redirect sa auth.html
async function checkAuth() {
    const { data: { session } } = await sb.auth.getSession();

    if (!session) {
        // Walang login session — bumalik sa login page
        window.location.href = 'auth.html';
        return;
    }

    currentUser = session.user;

    // Kunin ang profile ng user mula sa 'users' table
    const { data: profile } = await sb.from('users')
        .select('name, barangay, role')
        .eq('id', currentUser.id)
        .single();

    if (profile) {
        // I-update ang UI — pangalan at initials ng user
        document.querySelector('.user-badge span').textContent = profile.name || currentUser.email;
        document.querySelector('.avatar').textContent = getInitials(profile.name || 'User');
        document.querySelector('.location-badge').textContent = `📍 ${profile.barangay || 'Nueva Ecija'}`;

        // Kung Admin o DA Officer — i-redirect sa tamang dashboard
        if (profile.role === 'admin') window.location.href = 'admin.html';
        if (profile.role === 'da_officer') window.location.href = 'da-dashboard.html';
    }
}

// ── FUNCTION: getInitials(name) ───────────────────────────────
// Ginagawang initials ang buong pangalan para sa avatar circle
// Halimbawa: "Juan Dela Cruz" → "JD"
function getInitials(name) {
    return name.split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
}

// ── FUNCTION: loadDashboardStats() ───────────────────────────
// Naglo-load ng statistics ng kasalukuyang user mula sa Supabase
// Ipinapakita sa mga stat cards sa Dashboard
async function loadDashboardStats() {
    if (!currentUser) return;

    // Kunin ang lahat ng detections ng kasalukuyang user
    const { data: detections } = await sb.from('detections')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (!detections) return;

    // I-compute ang mga statistics
    const total    = detections.length;
    const today    = detections.filter(d => isToday(d.created_at)).length;
    const diseased = detections.filter(d => !d.disease?.toLowerCase().includes('healthy')).length;
    const healthy  = total - diseased;
    const severe   = detections.filter(d => d.severity === 'severe').length;
    const rice     = detections.filter(d => d.crop === 'rice').length;
    const tomato   = detections.filter(d => d.crop === 'tomato').length;

    // I-update ang stat cards sa HTML
    // Kailangan mong idagdag ang mga card na ito sa index.html
    updateStatCard('stat-today',   today);
    updateStatCard('stat-total',   total);
    updateStatCard('stat-healthy', healthy);
    updateStatCard('stat-diseased',diseased);
    updateStatCard('stat-severe',  severe);
    updateStatCard('stat-rice',    rice);
    updateStatCard('stat-tomato',  tomato);
}

// ── FUNCTION: updateStatCard(id, value) ──────────────────────
// I-update ang numero sa loob ng stat card
// Ginagamit ng loadDashboardStats()
function updateStatCard(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ── FUNCTION: isToday(dateString) ────────────────────────────
// Sinisigurado kung ang isang date ay ngayon
// Ginagamit para sa "Today's Detections" stat
function isToday(dateString) {
    const date  = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

// ── FUNCTION: loadWeather() ───────────────────────────────────
// Nagku-kuha ng real-time weather data gamit ang:
// 1. navigator.geolocation — para malaman ang GPS coordinates
// 2. Open-Meteo API — para sa weather data (libre, walang API key)
// 3. Nominatim API — para i-convert ang coordinates sa city name
async function loadWeather() {
    // Humingi ng permission sa GPS ng device
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        try {
            // ── WEATHER DATA mula sa Open-Meteo ──────────────
            // Libre at walang API key — direktang tawag lang
            const weatherRes = await fetch(
                `https://api.open-meteo.com/v1/forecast` +
                `?latitude=${lat}&longitude=${lon}` +
                `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m`
            );
            const weatherData = await weatherRes.json();
            const w = weatherData.current;

            // ── CITY NAME mula sa Nominatim ───────────────────
            // Kino-convert ang GPS coordinates sa readable na pangalan
            const geoRes  = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
            );
            const geoData = await geoRes.json();
            const city    = geoData.address?.city ||
                            geoData.address?.town ||
                            geoData.address?.municipality ||
                            'Nueva Ecija';

            // I-update ang location badge sa header
            document.querySelector('.location-badge').textContent = `📍 ${city}`;

            // I-update ang weather display sa UI
            updateWeatherUI({
                temp     : w.temperature_2m,
                humidity : w.relative_humidity_2m,
                rain     : w.precipitation,
                wind     : w.wind_speed_10m,
                city     : city
            });

            // I-check ang disease risk batay sa weather
            checkDiseaseRisk(w.temperature_2m, w.relative_humidity_2m, w.precipitation, w.wind_speed_10m);

        } catch (err) {
            console.warn('Weather load failed:', err);
        }
    }, () => {
        // Kung tinanggihan ang GPS permission — default location
        console.warn('GPS permission denied — using default location');
    });
}

// ── FUNCTION: updateWeatherUI(data) ──────────────────────────
// Ipinapakita ang weather data sa dashboard
// Kailangan mong idagdag ang weather section sa index.html
function updateWeatherUI({ temp, humidity, rain, wind, city }) {
    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setEl('w-city',     city);
    setEl('w-temp',     `${temp}°C`);
    setEl('w-humidity', `${humidity}%`);
    setEl('w-rain',     `${rain}mm`);
    setEl('w-wind',     `${wind} km/h`);
}

// ── FUNCTION: checkDiseaseRisk(temp, humidity, rain, wind) ────
// Sinisuri ang kasalukuyang weather conditions
// at nagba-babala kung mataas ang panganib ng sakit
// Batay sa mga rekomendasyon ng PhilRice at agricultural literature
function checkDiseaseRisk(temp, humidity, rain, wind) {
    let risks = [];

    // Rice Blast — mataas ang risk kapag mahalumok at katamtamang temperatura
    if (humidity >= 90 && temp >= 22 && temp <= 28) {
        risks.push('🚨 Mataas ang risk ng Rice Blast!');
    }
    // Bacterial Leaf Blight — mataas ang risk kapag maulan at mahangin
    if (rain >= 10 && wind >= 20) {
        risks.push('🚨 Mataas ang risk ng Bacterial Leaf Blight!');
    }
    // Late Blight (Tomato) — mataas ang risk kapag malamig at mahalumok
    if (humidity >= 90 && temp <= 20) {
        risks.push('🚨 Mataas ang risk ng Late Blight!');
    }
    // Early Blight (Tomato) — katamtamang risk kapag mainit at mahalumok
    if (humidity >= 80 && temp >= 24 && temp <= 30) {
        risks.push('⚠ Katamtamang risk ng Early Blight');
    }

    // Ipakita ang warnings sa UI
    const riskEl = document.getElementById('weather-risk');
    if (riskEl) {
        riskEl.innerHTML = risks.length
            ? risks.join('<br>')
            : '✅ Mababa ang disease risk ngayon';
    }
}

// ── FUNCTION: setCrop(crop) ───────────────────────────────────
// Tinatawag kapag nag-switch ang user ng crop (Rice o Tomato)
// I-update ang UI at i-load ang tamang AI model
function setCrop(crop) {
    currentCrop = crop; // I-update ang global state

    // I-update ang active state ng crop buttons
    document.getElementById('btn-rice')?.classList.toggle('active', crop === 'rice');
    document.getElementById('btn-tomato')?.classList.toggle('active', crop === 'tomato');

    // I-load ang bagong Teachable Machine model para sa napiling crop
    loadTMModel(crop);
}

// ── FUNCTION: loadTMModel(crop) ───────────────────────────────
// Naglo-load ng Teachable Machine model para sa offline detection
// Ginagamit bilang fallback kapag walang internet
// Model files ay dapat nasa: models/rice/ o models/tomato/
async function loadTMModel(crop) {
    try {
        const modelURL    = `./models/${crop}/model.json`;
        const metadataURL = `./models/${crop}/metadata.json`;

        // I-load ang model gamit ang tmImage library (Teachable Machine)
        tmModel = await tmImage.load(modelURL, metadataURL);
        tmModel._crop = crop; // I-tag ang model para malaman kung para saan ito
        console.log(`Teachable Machine model loaded for ${crop}`);
    } catch (err) {
        console.warn(`Could not load TM model for ${crop}:`, err);
        tmModel = null;
    }
}

// ── FUNCTION: runDetect() ─────────────────────────────────────
// PANGUNAHING DETECTION FUNCTION
// Tinatawag kapag nag-click ang user ng "Suriin Ngayon" button
// Flow:
//   1. Kumuha ng image mula sa camera o upload
//   2. I-validate kung dahon nga ang nasa larawan
//   3. I-call ang Roboflow API (online) o Teachable Machine (offline)
//   4. Ipakita ang resulta at i-save sa Supabase
async function runDetect() {
    // Kunin ang image source — camera video o uploaded image
    const src = isCameraOn
        ? document.getElementById('video')
        : document.getElementById('preview-img');

    if (!src) {
        showToast('Mag-upload muna ng larawan o i-on ang camera!');
        return;
    }

    // Ipakita ang loading state
    setDetectLoading(true);

    try {
        // ── STEP 1: LEAF VALIDATION ───────────────────────────
        // I-check kung dahon nga ang nasa larawan
        // Bago pa mag-waste ng API call sa Roboflow
        const isLeaf = validateLeaf(src);
        if (!isLeaf) {
            showToast('Hindi ito mukhang dahon. Subukang muli!');
            return;
        }

        // ── STEP 2: AI DETECTION ──────────────────────────────
        let predictions = null;

        if (currentCrop === 'rice' && navigator.onLine) {
            // ONLINE + RICE → Gamitin ang Roboflow (98.2% accuracy)
            predictions = await detectWithRoboflow(src);
        }

        if (!predictions && tmModel) {
            // OFFLINE o TOMATO → Gamitin ang Teachable Machine (fallback)
            predictions = await detectWithTeachableMachine(src);
        }

        if (!predictions) {
            showToast('Hindi ma-detect. Tiyaking naka-upload ang model files!');
            return;
        }

        // ── STEP 3: IPAKITA ANG RESULTA ───────────────────────
        displayResult(predictions);

        // ── STEP 4: I-SAVE SA SUPABASE ────────────────────────
        await saveDetection(predictions[0]);

    } catch (err) {
        console.error('Detection error:', err);
        showToast('May error sa detection. Subukan muli!');
    } finally {
        setDetectLoading(false); // Alisin ang loading state kahit may error
    }
}

// ── FUNCTION: validateLeaf(src) ──────────────────────────────
// Multi-layer na validation para ma-check kung dahon ang nasa larawan
// Layer 1: Green pixel analysis — bibilangin ang berdeng pixels
// Ibinabalik ang true (valid leaf) o false (not a leaf)
function validateLeaf(src) {
    const canvas = document.createElement('canvas');
    canvas.width  = 224;
    canvas.height = 224;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(src, 0, 0, 224, 224);

    // Kunin ang pixel data ng buong larawan
    const pixels = ctx.getImageData(0, 0, 224, 224).data;
    let greenCount = 0;
    let totalCount = 0;

    // Suriin ang bawat pixel — green ba ito?
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];      // Red
        const g = pixels[i + 1];  // Green
        const b = pixels[i + 2];  // Blue

        // Isang pixel ay "green" o "leaf-colored" kung:
        // - Ang green ay mas mataas kaysa red at blue
        // - O may kayumanggi/dilaw na kulay (para sa may sakit na dahon)
        const isGreen  = g > r && g > b && g > 60;
        const isBrown  = r > 100 && g > 60 && b < 80 && r > g;
        const isYellow = r > 150 && g > 130 && b < 80;

        if (isGreen || isBrown || isYellow) greenCount++;
        totalCount++;
    }

    // Kung mas mababa sa 12% ang leaf-colored pixels — hindi dahon
    const leafRatio = greenCount / totalCount;
    return leafRatio >= 0.12;
}

// ── FUNCTION: detectWithRoboflow(src) ────────────────────────
// Nagde-detect ng sakit gamit ang Roboflow API (ONLINE MODE)
// Ginagamit para sa RICE — 98.2% accuracy
// Ibinabalik ang array ng predictions: [{ className, probability }]
async function detectWithRoboflow(src) {
    // I-convert ang image sa base64 para ma-send sa API
    const base64 = await imageToBase64(src);

    const response = await fetch(`${RF_URL}?api_key=${RF_API_KEY}`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body   : base64.split(',')[1] // Alisin ang "data:image/jpeg;base64," prefix
    });

    if (!response.ok) throw new Error(`Roboflow API error: ${response.status}`);

    const result = await response.json();
    console.log('Roboflow result:', result);

    // I-convert ang Roboflow format papunta sa ating standard format
    return convertRoboflowResult(result);
}

// ── FUNCTION: detectWithTeachableMachine(src) ─────────────────
// Nagde-detect gamit ang locally cached Teachable Machine model
// Ginagamit para sa TOMATO o kapag walang internet (OFFLINE MODE)
async function detectWithTeachableMachine(src) {
    if (!tmModel) return null;

    // tmModel.predict() — built-in function ng Teachable Machine library
    // Ibinabalik ang array ng { className, probability }
    const predictions = await tmModel.predict(src);

    // I-sort mula pinaka-mataas hanggang pinaka-mababa ang confidence
    return predictions.sort((a, b) => b.probability - a.probability);
}

// ── FUNCTION: convertRoboflowResult(rfResult) ────────────────
// Kino-convert ang Roboflow API response papunta sa ating format
// Roboflow format: { predictions: { "ClassName": { confidence: 0.95 } } }
// Ating format: [{ className: "Rice Blast", probability: 0.95 }]
function convertRoboflowResult(rfResult) {
    // Mapping ng Roboflow class names papunta sa ating disease names
    const classMap = {
        'Blast'              : 'Rice Blast',
        'blast'              : 'Rice Blast',
        'Bacterial_Blight'   : 'Bacterial Leaf Blight',
        'bacterial_blight'   : 'Bacterial Leaf Blight',
        'Brown_Spot'         : 'Brown Spot',
        'brown_spot'         : 'Brown Spot',
        'Healthy'            : 'Healthy Rice',
        'healthy'            : 'Healthy Rice'
    };

    // Handle classification API format
    if (rfResult.predictions && typeof rfResult.predictions === 'object' && !Array.isArray(rfResult.predictions)) {
        return Object.entries(rfResult.predictions)
            .map(([cls, data]) => ({
                className  : classMap[cls] || cls,
                probability: typeof data === 'object' ? data.confidence : data
            }))
            .sort((a, b) => b.probability - a.probability);
    }

    // Handle detection API format (array)
    if (Array.isArray(rfResult.predictions)) {
        return rfResult.predictions
            .map(p => ({
                className  : classMap[p.class] || p.class,
                probability: p.confidence
            }))
            .sort((a, b) => b.probability - a.probability);
    }

    return null;
}

// ── FUNCTION: imageToBase64(src) ─────────────────────────────
// Kino-convert ang image/video element papunta sa base64 string
// Kailangan ito para ma-send ang larawan sa Roboflow API
function imageToBase64(src) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width  = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(src, 0, 0, 640, 480);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
    });
}

// ── FUNCTION: displayResult(predictions) ─────────────────────
// Ipinapakita ang detection result sa UI
// Kasama ang: disease name, confidence, severity, at treatment recommendations
function displayResult(predictions) {
    if (!predictions || !predictions.length) return;

    const top       = predictions[0]; // Pinaka-confident na result
    const isHealthy = top.className?.toLowerCase().includes('healthy');
    const confidence= Math.round(top.probability * 100);

    // Kung mababa ang confidence — huwag ipakita ang resulta
    if (confidence < 70) {
        showToast('Mababang accuracy. Subukan ng mas malinaw na larawan!');
        return;
    }

    // I-update ang result section sa HTML
    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setEl('result-disease',    top.className);
    setEl('result-confidence', `${confidence}%`);
    setEl('result-severity',   getSeverity(confidence, isHealthy));
    setEl('result-treatment',  getTreatment(top.className));

    // Ipakita ang result card
    const resultCard = document.getElementById('result-card');
    if (resultCard) resultCard.style.display = 'block';

    // Voice output — basahin ang resulta nang malakas
    speakResult(top.className, confidence);
}

// ── FUNCTION: getSeverity(confidence, isHealthy) ─────────────
// Tinutukoy ang severity level batay sa confidence at uri ng disease
// Ibinabalik: 'mild', 'moderate', o 'severe'
function getSeverity(confidence, isHealthy) {
    if (isHealthy) return 'healthy';
    if (confidence >= 90) return 'severe';
    if (confidence >= 75) return 'moderate';
    return 'mild';
}

// ── FUNCTION: getTreatment(disease) ──────────────────────────
// Ibinabalik ang treatment recommendation para sa isang sakit
// Batay sa mga rekomendasyon ng PhilRice at agricultural literature
function getTreatment(disease) {
    const treatments = {
        'Rice Blast'           : 'Mag-apply ng tricyclazole fungicide. Bawasan ang nitrogen fertilizer. Alisin ang infected na dahon.',
        'Brown Spot'           : 'Mag-apply ng mancozeb fungicide. Tiyaking sapat ang potassium fertilizer.',
        'Bacterial Leaf Blight': 'Huwag mag-apply ng nitrogen. Mag-drain ng tubig sa palayan. Mag-spray ng copper bactericide.',
        'Early Blight'         : 'Mag-apply ng chlorothalonil fungicide. Alisin ang infected na dahon. Mag-mulch sa paligid ng halaman.',
        'Late Blight'          : 'Mag-apply ng metalaxyl fungicide AGAD. Bawasan ang didilig. Alisin ang infected na halaman.',
        'Leaf Mold'            : 'Pahusayin ang air circulation. Bawasan ang humidity. Mag-apply ng fungicide.',
        'Healthy Rice'         : 'Malusog ang iyong palay! Ituloy ang regular na pag-aalaga.',
        'Healthy Tomato'       : 'Malusog ang iyong kamatis! Ituloy ang regular na pag-aalaga.'
    };
    return treatments[disease] || 'Kumonsulta sa agricultural extension officer para sa tamang treatment.';
}

// ── FUNCTION: speakResult(disease, confidence) ────────────────
// Binabasa nang malakas ang detection result gamit ang Web Speech API
// Gumagana sa Filipino at English — built-in sa browser, libre
function speakResult(disease, confidence) {
    if (!('speechSynthesis' in window)) return; // Hindi supported ang browser

    const isHealthy = disease.toLowerCase().includes('healthy');
    const msg       = isHealthy
        ? `Malusog ang iyong pananim! ${disease}, ${confidence} porsyento ang katumpakan.`
        : `May sakit ang iyong pananim. ${disease}. ${confidence} porsyento ang katumpakan. Kumonsulta sa agricultural officer.`;

    const utterance  = new SpeechSynthesisUtterance(msg);
    utterance.lang   = 'fil-PH'; // Filipino language
    utterance.rate   = 0.9;      // Bahagyang mabagal para mas malinaw
    utterance.volume = 1.0;

    window.speechSynthesis.cancel(); // Ihinto ang anumang kasalukuyang speech
    window.speechSynthesis.speak(utterance);
}

// ── FUNCTION: saveDetection(topPrediction) ───────────────────
// Nag-sa-save ng detection result sa Supabase database
// Para magamit ng Admin at DA Officer dashboards
async function saveDetection(topPrediction) {
    if (!currentUser) return;

    const confidence = Math.round(topPrediction.probability * 100);
    const isHealthy  = topPrediction.className?.toLowerCase().includes('healthy');

    // I-save ang detection sa 'detections' table ng Supabase
    const { error } = await sb.from('detections').insert({
        user_id   : currentUser.id,
        crop      : currentCrop,
        disease   : topPrediction.className,
        confidence: confidence,
        severity  : getSeverity(confidence, isHealthy),
        created_at: new Date().toISOString()
        // location_name at weather data — idagdag mo kung gusto
    });

    if (error) console.warn('Save detection error:', error);
    else console.log('Detection saved successfully!');

    // I-refresh ang dashboard stats pagkatapos mag-save
    await loadDashboardStats();
}

// ── FUNCTION: toggleCamera() ─────────────────────────────────
// Ini-on o ini-off ang camera ng device
// Ginagamit ang getUserMedia API — kailangan ng HTTPS para gumana
async function toggleCamera() {
    if (isCameraOn) {
        // I-off ang camera — ihinto ang video stream
        videoStream?.getTracks().forEach(track => track.stop());
        isCameraOn = false;
        document.getElementById('video').style.display = 'none';
    } else {
        try {
            // Humingi ng permission sa camera
            videoStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' } // Gamitin ang rear camera
            });
            const video  = document.getElementById('video');
            video.srcObject = videoStream;
            video.style.display = 'block';
            isCameraOn = true;
        } catch (err) {
            showToast('Hindi ma-access ang camera. Mag-upload na lang ng larawan.');
        }
    }
}

// ── FUNCTION: handleImageUpload(event) ───────────────────────
// Tinatawag kapag nag-upload ang user ng larawan
// Ipinapakita ang preview ng larawan bago mag-detect
function handleImageUpload(event) {
    const file   = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.getElementById('preview-img');
        if (img) {
            img.src           = e.target.result;
            img.style.display = 'block';
        }
    };
    reader.readAsDataURL(file); // I-convert ang file sa base64 para sa preview
}

// ── FUNCTION: setDetectLoading(isLoading) ────────────────────
// Ipinapakita o itinatago ang loading spinner habang nagde-detect
function setDetectLoading(isLoading) {
    const btn     = document.getElementById('btn-detect');
    const spinner = document.getElementById('detect-spinner');
    const btnText = document.getElementById('detect-text');

    if (btn)     btn.disabled          = isLoading;
    if (spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';
    if (btnText) btnText.style.display = isLoading ? 'none' : 'inline';
}

// ── FUNCTION: setupNavigation() ──────────────────────────────
// Ini-setup ang sidebar navigation links
// Dashboard, Scan Crop, Analytics
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Alisin ang active sa lahat
            navLinks.forEach(l => l.classList.remove('active'));
            // Idagdag sa na-click
            link.classList.add('active');

            // TODO: Palitan ng actual page navigation o section switching
            const label = link.querySelector('span:last-child')?.textContent;
            if (label === 'Analytics') window.location.href = 'analytics.html';
        });
    });
}

// ── FUNCTION: setupLogout() ───────────────────────────────────
// Ini-setup ang logout button
// Tinatawag ang Supabase signOut() at ire-redirect sa auth.html
function setupLogout() {
    const logoutBtn = document.querySelector('.btn-logout');
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', async () => {
        await sb.auth.signOut();
        window.location.href = 'auth.html';
    });
}

// ── FUNCTION: showToast(message) ─────────────────────────────
// Nagpapakita ng temporary notification sa ibaba ng screen
// Katulad ng toast sa auth.js — consistent ang UI behavior
function showToast(message) {
    const toast = document.getElementById('toast-msg');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}
