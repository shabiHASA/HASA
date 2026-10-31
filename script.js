// 곡 데이터(songs)는 songs.js에 있어요

let currentSongIndex = -1;
let isPlaying = false;
let isRepeat = false;
let isShuffle = false;
let searchTerm = '';
let view = 'all';

const $ = id => document.getElementById(id);
const audio = $('audioPlayer'), deck = $('deck');
const cdCover = $('cdCover'), discCover = $('discCover');
const titleEl = $('currentTitle'), artistEl = $('currentArtist'), trackNo = $('trackNo');
const progressBar = $('progressBar'), progress = $('progress');
const curTimeEl = $('currentTime'), durEl = $('duration');
const playlistEl = $('playlist');
const lyricsSection = $('lyricsSection'), lyricsText = $('lyricsText');
const repeatBtn = $('repeatBtn'), shuffleBtn = $('shuffleBtn');
const likeBtn = $('likeBtn'), volume = $('volume'), muteBtn = $('muteBtn');

// 저장소 (브라우저에 좋아요/볼륨/마지막 곡 기억)
const store = {
  get(k, d) { try { const v = localStorage.getItem('hasa:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hasa:' + k, JSON.stringify(v)); } catch {} }
};
let liked = new Set(store.get('liked', []));

const FALLBACK_COVER = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#3a0814'/><stop offset='1' stop-color='#0a0a0c'/></linearGradient></defs>
    <rect width='400' height='400' fill='url(#g)'/>
    <text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' font-size='140' fill='#ff4062'>♪</text></svg>`);

const pad = n => String(n).padStart(2, '0');
const formatTime = s => isFinite(s) ? `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}` : '0:00';

function setCover(img, src) {
  img.onerror = () => { img.onerror = null; img.src = FALLBACK_COVER; };
  img.src = src || FALLBACK_COVER;
}

// ── 칸 안에서 흘러가는 글자
function setMarquee(el, text) {
  el.classList.remove('on');
  el.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(span);
  requestAnimationFrame(() => {
    if (span.scrollWidth <= el.clientWidth + 1) return;
    const gap = '    ✦    ';
    span.textContent = text + gap + text + gap;
    el.style.setProperty('--dur', Math.max(6, text.length * 0.38) + 's');
    el.classList.add('on');
  });
}

// ── 목록
function createSongItem(song, index) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'song-item' + (index === currentSongIndex ? ' active' : '');

  const trk = document.createElement('span');
  trk.className = 'trk'; trk.textContent = pad(index + 1);

  const img = document.createElement('img');
  img.alt = ''; img.loading = 'lazy';
  setCover(img, song.cover);

  const meta = document.createElement('div');
  meta.className = 'song-meta';
  const t = document.createElement('div');
  t.className = 'song-item-title marquee';
  const a = document.createElement('div');
  a.className = 'song-item-artist'; a.textContent = song.artist;
  meta.append(t, a);

  const side = document.createElement('div');
  side.className = 'song-side';
  const d = document.createElement('span');
  d.className = 'song-duration'; d.textContent = song.duration || '';
  side.appendChild(d);
  if (liked.has(song.title)) {
    side.insertAdjacentHTML('beforeend', '<svg class="liked-mark" viewBox="0 0 24 24" aria-label="좋아요한 곡"><path d="M12 21l-1.5-1.3C5.4 15.1 2 12.1 2 8.4 2 5.4 4.4 3 7.4 3c1.7 0 3.4.8 4.6 2.1C13.2 3.8 14.9 3 16.6 3 19.6 3 22 5.4 22 8.4c0 3.7-3.4 6.7-8.5 11.3L12 21z"/></svg>');
  }

  btn.append(trk, img, meta, side);

  // 재생 중인 곡은 항상, 나머지는 마우스를 올렸을 때 제목이 흘러감
  const plain = () => { t.classList.remove('on'); t.innerHTML = ''; const s = document.createElement('span'); s.textContent = song.title; t.appendChild(s); };
  plain();
  if (index === currentSongIndex) requestAnimationFrame(() => setMarquee(t, song.title));
  else {
    btn.addEventListener('mouseenter', () => setMarquee(t, song.title));
    btn.addEventListener('mouseleave', plain);
  }

  btn.addEventListener('click', () => {
    if (index === currentSongIndex) { isPlaying ? pauseSong() : playSong(); return; }
    loadSong(index); playSong();
  });
  return btn;
}

function visibleSongs() {
  const q = searchTerm.toLowerCase();
  return songs.filter(s =>
    (view === 'all' || liked.has(s.title)) &&
    (s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)));
}

function renderPlaylist() {
  playlistEl.innerHTML = '';
  const list = visibleSongs();
  list.forEach(s => playlistEl.appendChild(createSongItem(s, songs.indexOf(s))));
  if (!list.length) {
    const e = document.createElement('p');
    e.className = 'empty';
    e.textContent = searchTerm
      ? `'${searchTerm}'와 맞는 곡이 없어요`
      : '아직 좋아요한 곡이 없어요. 플레이어의 하트를 눌러 모아보세요.';
    playlistEl.appendChild(e);
  }
  $('songCount').textContent = view === 'liked' ? `${liked.size}곡` : `${songs.length}곡`;
}

// ── 곡 로드
function loadSong(index, { resumeAt = 0 } = {}) {
  if (index < 0 || index >= songs.length) return;
  currentSongIndex = index;
  const song = songs[index];

  audio.src = song.audio;
  if (resumeAt) audio.addEventListener('loadedmetadata', () => { audio.currentTime = resumeAt; }, { once: true });

  setCover(cdCover, song.cover);
  setCover(discCover, song.cover);
  cdCover.onload = () => deck.style.setProperty('--cover', `url("${cdCover.currentSrc || cdCover.src}")`);

  setMarquee(titleEl, song.title);
  setMarquee(artistEl, song.artist);
  trackNo.textContent = `TRK ${pad(index + 1)}/${pad(songs.length)}`;
  progress.style.width = '0%';
  curTimeEl.textContent = '0:00';
  durEl.textContent = song.duration || '0:00';
  likeBtn.setAttribute('aria-pressed', liked.has(song.title));

  lyricsSection.hidden = false;
  if (song.lyrics) lyricsText.textContent = song.lyrics;
  else lyricsText.innerHTML = '<p class="no-lyrics">이 곡은 가사가 등록되지 않았어요</p>';
  lyricsText.scrollTop = 0;

  updateMediaSession(song);
  store.set('last', { index, time: resumeAt });
  renderPlaylist();
}

// ── 재생 제어
function playSong() {
  if (currentSongIndex === -1) loadSong(0);
  const p = audio.play();
  if (p && p.catch) p.catch(() => {});
  isPlaying = true;
  deck.classList.add('is-playing');
}
function pauseSong() {
  audio.pause();
  isPlaying = false;
  deck.classList.remove('is-playing');
}
function prevSong() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  loadSong(currentSongIndex <= 0 ? songs.length - 1 : currentSongIndex - 1);
  if (isPlaying) playSong();
}
function nextSong() {
  let i;
  if (isShuffle && songs.length > 1) {
    do { i = Math.floor(Math.random() * songs.length); } while (i === currentSongIndex);
  } else {
    i = (currentSongIndex + 1) % songs.length;
  }
  loadSong(i);
  if (isPlaying) playSong();
}

// ── 휴대폰 잠금화면/이어폰 버튼 연동
function updateMediaSession(song) {
  if (!('mediaSession' in navigator)) return;
  let art = [];
  try { art = [{ src: new URL(song.cover, location.href).href, sizes: '512x512' }]; } catch {}
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: song.title, artist: song.artist, album: 'HASA_ARCHIVE', artwork: art });
  } catch {
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: song.title, artist: song.artist, album: 'HASA_ARCHIVE' }); } catch {}
  }
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
  set('play', playSong);
  set('pause', pauseSong);
  set('previoustrack', prevSong);
  set('nexttrack', nextSong);
  set('seekto', e => { audio.currentTime = e.seekTime; });
}

// ── 이벤트
$('playBtn').addEventListener('click', () => isPlaying ? pauseSong() : playSong());
$('prevBtn').addEventListener('click', prevSong);
$('nextBtn').addEventListener('click', nextSong);

let lastSave = 0;
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progress.style.width = pct + '%';
  progressBar.setAttribute('aria-valuenow', Math.round(pct));
  curTimeEl.textContent = formatTime(audio.currentTime);
  if (Date.now() - lastSave > 3000) { lastSave = Date.now(); store.set('last', { index: currentSongIndex, time: audio.currentTime }); }
});
audio.addEventListener('loadedmetadata', () => { durEl.textContent = formatTime(audio.duration); });
audio.addEventListener('ended', () => {
  if (isRepeat) { audio.currentTime = 0; playSong(); }
  else nextSong();
});
audio.addEventListener('error', () => {
  if (currentSongIndex === -1) return;
  pauseSong();
  setMarquee(artistEl, '음원 파일을 찾을 수 없어요');
});

function seek(clientX) {
  if (!audio.duration) return;
  const r = progressBar.getBoundingClientRect();
  audio.currentTime = Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * audio.duration;
}
progressBar.addEventListener('click', e => seek(e.clientX));
progressBar.addEventListener('keydown', e => {
  if (!audio.duration) return;
  if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.currentTime + 5, audio.duration);
  if (e.key === 'ArrowLeft') audio.currentTime = Math.max(audio.currentTime - 5, 0);
});

function syncToggles() {
  repeatBtn.setAttribute('aria-pressed', isRepeat);
  shuffleBtn.setAttribute('aria-pressed', isShuffle);
}
repeatBtn.addEventListener('click', () => { isRepeat = !isRepeat; if (isRepeat) isShuffle = false; syncToggles(); });
shuffleBtn.addEventListener('click', () => { isShuffle = !isShuffle; if (isShuffle) isRepeat = false; syncToggles(); });

// 좋아요
likeBtn.addEventListener('click', () => {
  if (currentSongIndex === -1) return toast('먼저 곡을 골라주세요');
  const t = songs[currentSongIndex].title;
  liked.has(t) ? liked.delete(t) : liked.add(t);
  store.set('liked', [...liked]);
  likeBtn.setAttribute('aria-pressed', liked.has(t));
  renderPlaylist();
});

// 링크 복사 — 받은 사람이 열면 그 곡이 바로 올라와 있음
$('shareBtn').addEventListener('click', async () => {
  if (currentSongIndex === -1) return toast('먼저 곡을 골라주세요');
  const url = location.href.split('#')[0] + '#track-' + (currentSongIndex + 1);
  try { await navigator.clipboard.writeText(url); toast('이 곡 링크를 복사했어요'); }
  catch { prompt('아래 링크를 복사하세요', url); }
});

// 볼륨
function applyVolume(v) {
  audio.volume = v / 100;
  volume.value = v;
  volume.style.setProperty('--v', v + '%');
  muteBtn.setAttribute('aria-pressed', v === 0);
  store.set('volume', v);
}
let lastVol = store.get('volume', 80) || 80;
volume.addEventListener('input', () => { const v = +volume.value; if (v) lastVol = v; applyVolume(v); });
muteBtn.addEventListener('click', () => applyVolume(+volume.value === 0 ? lastVol : 0));

// 가사 접기/펼치기
$('lyricsHeader').addEventListener('click', e => {
  const b = e.currentTarget, open = b.getAttribute('aria-expanded') !== 'true';
  b.setAttribute('aria-expanded', open);
  $('lyricsContent').classList.toggle('open', open);
});

// 검색 & 탭
$('searchBox').addEventListener('input', e => { searchTerm = e.target.value.trim(); renderPlaylist(); });
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  view = tab.dataset.view;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t === tab));
  renderPlaylist();
}));

// 커버 크게 보기
const viewer = $('viewer');
function openViewer() {
  if (currentSongIndex === -1) return;
  const s = songs[currentSongIndex];
  $('viewerImg').src = cdCover.src;
  $('viewerTitle').textContent = s.title;
  $('viewerArtist').textContent = s.artist;
  viewer.classList.add('open');
  viewer.setAttribute('aria-hidden', 'false');
  $('viewerClose').focus();
}
function closeViewer() {
  viewer.classList.remove('open');
  viewer.setAttribute('aria-hidden', 'true');
  $('jewel').focus();
}
$('jewel').addEventListener('click', openViewer);
$('viewerClose').addEventListener('click', closeViewer);
viewer.addEventListener('click', e => { if (e.target === viewer) closeViewer(); });

// 토스트
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// 키보드
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && viewer.classList.contains('open')) return closeViewer();
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.code === 'Space' && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); isPlaying ? pauseSong() : playSong(); }
  if (e.key === 'n' || e.key === 'N') nextSong();
  if (e.key === 'p' || e.key === 'P') prevSong();
});

// 제목 칸 크기가 바뀌면 흘러가기 다시 계산
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentSongIndex === -1) return;
    const s = songs[currentSongIndex];
    setMarquee(titleEl, s.title); setMarquee(artistEl, s.artist); renderPlaylist();
  }, 200);
});

// ── 시작: 공유 링크 > 마지막으로 듣던 곡 순서로 불러오기
applyVolume(store.get('volume', 80));
setCover(cdCover); setCover(discCover);
const hash = location.hash.match(/^#track-(\d+)$/);
const last = store.get('last', null);
if (hash && songs[+hash[1] - 1]) loadSong(+hash[1] - 1);
else if (last && songs[last.index]) loadSong(last.index, { resumeAt: last.time || 0 });
else renderPlaylist();
