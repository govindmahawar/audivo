// ============================================
// SUPABASE CLIENT
// ============================================
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hkyysqsfgpjeutevytpu.supabase.co'
const supabaseAnonKey = 'sb_publishable_eocQJoA0KYdRtpKQd3HQQQ_TKSAAubO'
const supabase = createClient(supabaseUrl, supabaseAnonKey)
console.log('✅ Supabase Connected!')

// ============================================
// STATE
// ============================================
let currentUser = null
let songs = []
let artists = []
let followedArtists = []
let currentSongIndex = 0
let audio = new Audio()
let isPlaying = false
let currentViewingPlaylistId = null
let currentViewingPlaylistName = ''
let likedSongIds = []
let playHistory = []
let userBehavior = { genrePlayCount: {}, artistPlayCount: {} }

// ============================================
// SPOTIFY-STYLE LOGIN NAVIGATION
// ============================================
window.openForm = function(type) {
  document.getElementById('landing-page').classList.add('hidden')
  if (type === 'signup') {
    document.getElementById('signup-page').classList.remove('hidden')
  } else {
    document.getElementById('login-page').classList.remove('hidden')
  }
}

window.goToLanding = function() {
  document.getElementById('signup-page').classList.add('hidden')
  document.getElementById('login-page').classList.add('hidden')
  document.getElementById('landing-page').classList.remove('hidden')
}

// ============================================
// AUTH FUNCTIONS (Email Only - Simplicity)
// ============================================

// --- Sign Up ---
window.handleSignup = async function() {
  const email = document.getElementById('signup-email').value.trim()
  const password = document.getElementById('signup-password').value.trim()
  const errorEl = document.getElementById('signup-error')
  errorEl.textContent = ''
  
  if (!email || !password) { errorEl.textContent = 'Please fill all fields'; return }
  if (password.length < 6) { errorEl.textContent = 'Password must be at least 6 characters'; return }
  
  try {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    alert('✅ Account created! Please check your email to verify.')
    // Go back to landing, user can now Login
    goToLanding()
    document.getElementById('login-email').value = email
  } catch (error) {
    errorEl.textContent = error.message
  }
}

// --- Log In ---
window.handleLogin = async function() {
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value.trim()
  const errorEl = document.getElementById('login-error')
  errorEl.textContent = ''
  
  if (!email || !password) { errorEl.textContent = 'Please fill all fields'; return }
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    currentUser = data.user
    onAuthSuccess(data.user)
  } catch (error) {
    errorEl.textContent = error.message
  }
}

// --- Logout ---
window.handleLogout = async function() {
  try {
    await supabase.auth.signOut()
    currentUser = null
    songs = []
    artists = []
    followedArtists = []
    playHistory = []
    likedSongIds = []
    document.getElementById('login-screen').style.display = 'flex'
    document.getElementById('app').classList.add('hidden')
    document.getElementById('mini-player').classList.add('hidden')
    document.getElementById('mini-player').classList.remove('active')
    audio.pause()
    audio.src = ''
  } catch (error) {
    alert('Logout error: ' + error.message)
  }
}

// --- On Auth Success ---
function onAuthSuccess(user) {
  currentUser = user
  document.getElementById('login-screen').style.display = 'none'
  const app = document.getElementById('app')
  app.classList.remove('hidden')
  app.style.display = 'flex'

  const identifier = user.email || user.phone || 'User'
  const letter = identifier[0].toUpperCase()
  document.getElementById('avatar-letter').textContent      = letter
  document.getElementById('pm-avatar-letter').textContent   = letter
  document.getElementById('profile-name-label').textContent = identifier
  document.getElementById('profile-role-label').textContent = '🎵 Listener'
  document.getElementById('made-for-label') && (document.getElementById('made-for-label').textContent = `Made For ${identifier.split('@')[0] || identifier}`)

  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'))

  checkIfAdmin(user.id, user.email || user.phone)
  loadSongs()
  loadLikedSongs()
  loadPlaylists()
  loadArtists()
  renderGenreGrid()
}

// ============================================
// ADMIN CHECK
// ============================================
async function checkIfAdmin(userId, identifier) {
  try {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    let isAdmin = (data && data.role === 'admin') || identifier === 'admin@audivo.com'
    if (identifier === 'admin@audivo.com' && (!data || data.role !== 'admin')) {
      await supabase.from('profiles').upsert({ id: userId, role: 'admin' })
    }
    if (isAdmin) {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'))
      document.getElementById('profile-role-label').textContent = '👑 Administrator'
    }
  } catch (e) {
    console.log('Admin check error:', e.message)
  }
}

async function loadAllUsers() {
  try {
    const { data: profileList } = await supabase.from('profiles').select('id, role')
    const container = document.getElementById('all-users-list')
    if (!container || !profileList) return
    container.innerHTML = profileList.length === 0
      ? `<p style="color:var(--text-muted)">No user profiles found.</p>`
      : profileList.map(u => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #333;">
            <div>
              <div style="font-weight:600;">${u.id.substring(0,8)}...</div>
              <div style="font-size:12px;color:var(--text-muted);">Role: ${u.role || 'user'}</div>
            </div>
            <button class="ripple" onclick="toggleAdminRole('${u.id}','${u.role||'user'}')"
              style="background:${u.role==='admin'?'var(--accent)':'#444'};border:none;color:${u.role==='admin'?'#000':'#fff'};padding:5px 12px;border-radius:50px;font-weight:bold;cursor:pointer;font-size:12px;">
              ${u.role === 'admin' ? '✓ Admin' : 'Make Admin'}
            </button>
          </div>`).join('')
  } catch (error) {
    console.error('Error loading users:', error)
  }
}

window.toggleAdminRole = async function(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin'
  try {
    const { error } = await supabase.from('profiles').upsert({ id: userId, role: newRole })
    if (error) throw error
    loadAllUsers()
    alert(`User role updated to ${newRole}!`)
  } catch (error) {
    alert('Error updating role: ' + error.message)
  }
}

// ============================================
// SONGS
// ============================================
async function loadSongs() {
  try {
    const { data, error } = await supabase.from('song').select('*')
    if (error) throw error
    songs = data || []
    renderHome()
  } catch (error) {
    console.error('Load songs error:', error)
  }
}

function renderHome() {
  if (songs.length === 0) {
    document.getElementById('home-empty-state').style.display = 'flex'
    document.getElementById('home-content').classList.add('hidden')
    return
  }
  document.getElementById('home-empty-state').style.display = 'none'
  document.getElementById('home-content').classList.remove('hidden')

  const recent   = [...songs].reverse().slice(0, 10)
  const newRel   = songs.filter(s => s.is_new_release)
  const popular  = [...songs].sort((a,b) => (b.plays||0) - (a.plays||0)).slice(0, 10)
  const madeFor  = [...songs].sort(() => Math.random() - 0.5).slice(0, 10)

  renderRow('recent-upload-list', recent)
  renderRow('new-release-list',   newRel)
  renderRow('popular-songs-list', popular)
  renderRow('made-for-list',      madeFor)
  renderRow('all-songs-list',     songs.slice(0, 20))

  document.getElementById('section-new-release').style.display = newRel.length ? 'block' : 'none'

  renderQuickAccess()
  renderArtistsSection()
}

function renderRow(id, list) {
  const el = document.getElementById(id)
  if (!el) return
  if (!list || list.length === 0) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:10px;">No songs yet</div>`
    return
  }
  el.innerHTML = list.map(song => `
    <div class="h-card" onclick="playSongById('${song.id}')">
      <div class="h-thumb">
        ${song.cover_url ? `<img src="${song.cover_url}" alt="${song.title}"/>` : `<i class="fa fa-music" style="color:var(--accent)"></i>`}
        <div class="play-over"><i class="fa fa-play-circle"></i></div>
      </div>
      ${song.is_new_release ? '<div class="new-badge">🔥 NEW</div>' : ''}
      <div class="h-card-label">${song.title}</div>
      <div class="h-card-sub">${song.artist}</div>
      <button onclick="event.stopPropagation();addCurrentSongToPlaylist('${song.id}')"
        style="background:var(--surface3);border:none;color:var(--text-muted);font-size:10px;padding:4px 8px;border-radius:12px;margin-top:6px;cursor:pointer;width:100%;">
        <i class="fa fa-plus"></i> Add to Playlist
      </button>
    </div>`).join('')
}

function renderQuickAccess() {
  const items = playHistory.length ? [...new Map(playHistory.map(s=>[s.id,s])).values()].slice(0,6) : songs.slice(0,6)
  const el    = document.getElementById('quick-access-row')
  if (!el) return
  el.innerHTML = items.map(s => `
    <div class="quick-item ripple" onclick="playSongById('${s.id}')">
      <div class="quick-color-block">
        ${s.cover_url ? `<img src="${s.cover_url}" alt="${s.title}"/>` : `<i class="fa fa-music"></i>`}
      </div>
      <span>${s.title}</span>
    </div>`).join('')
}

// ============================================
// ARTISTS
// ============================================
async function loadArtists() {
  try {
    const { data, error } = await supabase.from('artists').select('*')
    if (error) throw error
    artists = data || []
    renderArtistsSection()
  } catch (e) {
    console.log('Artists table may not exist yet:', e.message)
    artists = []
  }
}

function renderArtistsSection() {
  const sec = document.getElementById('section-popular-artists')
  const el  = document.getElementById('popular-artists-list')
  if (!el) return
  if (artists.length === 0) { if (sec) sec.style.display = 'none'; return }
  if (sec) sec.style.display = 'block'
  const colors = ["#e74c3c","#8b5cf6","#1db954","#f39c12","#3498db","#e67e22","#9b59b6","#16a085"]
  el.innerHTML = artists.map((a, i) => {
    const isFollowing = followedArtists.some(f => f.id === a.id)
    return `
      <div class="artist-card">
        <div class="artist-thumb" style="background:${a.photo_url ? 'transparent' : colors[i % colors.length]}">
          ${a.photo_url ? `<img src="${a.photo_url}" alt="${a.name}"/>` : `<i class="fa fa-user"></i>`}
        </div>
        <div class="artist-name">${a.name}</div>
        <div class="artist-genre">${a.genre || ''}</div>
        <button class="follow-btn ripple ${isFollowing ? 'following' : ''}"
          onclick="toggleFollow(${a.id}, this)">
          ${isFollowing ? 'Following ✓' : 'Follow'}
        </button>
      </div>`
  }).join('')
}

function toggleFollow(artistId, btn) {
  const artist = artists.find(a => a.id === artistId)
  if (!artist) return
  const idx = followedArtists.findIndex(f => f.id === artistId)
  if (idx === -1) {
    followedArtists.push(artist)
    btn.textContent = 'Following ✓'
    btn.classList.add('following')
  } else {
    followedArtists.splice(idx, 1)
    btn.textContent = 'Follow'
    btn.classList.remove('following')
  }
  renderFollowedArtists()
}

function renderFollowedArtists() {
  const el     = document.getElementById('followed-artists-list')
  const colors = ["#e74c3c","#8b5cf6","#1db954","#f39c12","#3498db","#e67e22"]
  if (!el) return
  if (!followedArtists.length) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:8px 0">No artists followed yet. Follow artists from Home.</p>`
    return
  }
  el.innerHTML = followedArtists.map((a, i) => `
    <div class="followed-artist-row">
      <div class="followed-artist-photo" style="background:${a.photo_url ? 'transparent' : colors[i % colors.length]}">
        ${a.photo_url ? `<img src="${a.photo_url}" alt="${a.name}"/>` : `<i class="fa fa-user" style="color:#fff"></i>`}
      </div>
      <div class="followed-artist-info">
        <div class="followed-artist-name">${a.name}</div>
        <div class="followed-artist-meta">Artist • ${a.genre || 'Music'}</div>
      </div>
      <button class="follow-btn following ripple" onclick="unfollowArtist(${a.id}, this)">Following ✓</button>
    </div>`).join('')
}

window.unfollowArtist = function(artistId, btn) {
  const idx = followedArtists.findIndex(f => f.id === artistId)
  if (idx !== -1) followedArtists.splice(idx, 1)
  renderFollowedArtists()
  renderArtistsSection()
}

// ============================================
// ADD ARTIST (Admin)
// ============================================
let selectedArtistPhotoFile = null

window.handleArtistPhotoSelect = function(e) {
  const file = e.target.files[0]
  if (!file) return
  selectedArtistPhotoFile = file
  const reader = new FileReader()
  reader.onload = ev => {
    const img = document.getElementById('artist-photo-preview')
    img.src = ev.target.result
    img.classList.remove('hidden')
    document.getElementById('artist-cover-placeholder').style.display = 'none'
  }
  reader.readAsDataURL(file)
}

window.addArtist = async function() {
  if (!currentUser) return
  const name  = document.getElementById('artist-name-input').value.trim()
  const genre = document.getElementById('artist-genre-input').value.trim()
  const bio   = document.getElementById('artist-bio-input').value.trim()
  if (!name) { alert('Artist name is required.'); return }

  try {
    let photoUrl = null
    if (selectedArtistPhotoFile) {
      const ext  = selectedArtistPhotoFile.name.split('.').pop()
      const path = `artists/${Date.now()}_${name.replace(/\s/g,'_')}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('covers').upload(path, selectedArtistPhotoFile)
      if (!uploadErr) {
        const { data } = supabase.storage.from('covers').getPublicUrl(path)
        photoUrl = data.publicUrl
      }
    }

    const { data, error } = await supabase.from('artists').insert({ name, genre, bio, photo_url: photoUrl }).select()
    if (error) throw error

    artists.push(data[0])

    document.getElementById('add-artist-form').style.display  = 'none'
    document.getElementById('artist-cover-picker').style.display = 'none'
    const suc = document.getElementById('add-artist-success')
    suc.classList.remove('hidden')

    setTimeout(() => {
      suc.classList.add('hidden')
      document.getElementById('add-artist-form').style.display    = 'flex'
      document.getElementById('artist-cover-picker').style.display = 'flex'
      document.getElementById('artist-name-input').value  = ''
      document.getElementById('artist-genre-input').value = ''
      document.getElementById('artist-bio-input').value   = ''
      document.getElementById('artist-photo-preview').classList.add('hidden')
      document.getElementById('artist-photo-preview').src = ''
      document.getElementById('artist-cover-placeholder').style.display = 'flex'
      document.getElementById('artist-photo-input').value = ''
      selectedArtistPhotoFile = null
    }, 2000)

    renderArtistsSection()
  } catch (error) {
    alert('Error adding artist: ' + error.message)
  }
}

// ============================================
// SEARCH
// ============================================
window.searchSongs = function() {
  const query      = document.getElementById('search-input').value.trim().toLowerCase()
  const resultsEl  = document.getElementById('search-results')
  const emptyEl    = document.getElementById('search-empty')
  const wrapEl     = document.getElementById('search-results-wrap')
  const countEl    = document.getElementById('results-count')
  const clearBtn   = document.getElementById('search-clear-btn')
  const suggEl     = document.getElementById('search-suggestions')

  suggEl.classList.add('hidden')

  if (!query) {
    wrapEl.classList.add('hidden')
    emptyEl.style.display = 'block'
    clearBtn.style.display = 'none'
    return
  }

  clearBtn.style.display = 'block'
  wrapEl.classList.remove('hidden')
  emptyEl.style.display = 'none'

  if (!songs.length) {
    resultsEl.innerHTML = `<div style="color:var(--text-muted);padding:20px;text-align:center">No songs uploaded yet.</div>`
    countEl.textContent = ''
    return
  }

  const filtered = songs.filter(s =>
    s.title.toLowerCase().includes(query) ||
    s.artist.toLowerCase().includes(query) ||
    (s.genre && s.genre.toLowerCase().includes(query))
  )

  countEl.textContent = `${filtered.length} result${filtered.length !== 1 ? 's' : ''} found`
  resultsEl.innerHTML = filtered.length
    ? filtered.map(song => `
        <div class="song-row" onclick="playSongById('${song.id}')">
          <div class="row-thumb">
            ${song.cover_url ? `<img src="${song.cover_url}"/>` : `<i class="fa fa-music"></i>`}
          </div>
          <div class="row-info">
            <div class="row-title">${song.title}</div>
            <div class="row-artist">${song.artist} • ${song.genre || ''}</div>
          </div>
          <button onclick="event.stopPropagation();addCurrentSongToPlaylist('${song.id}')"
            style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:6px;">
            <i class="fa fa-plus-circle"></i>
          </button>
        </div>`).join('')
    : `<div style="color:var(--text-muted);padding:20px;text-align:center">No results for "<b style="color:#fff">${query}</b>"</div>`
}

window.showSearchSuggestions = function() {
  const suggEl = document.getElementById('search-suggestions')
  const q      = document.getElementById('search-input').value.trim()
  if (q) return

  const gc = userBehavior.genrePlayCount
  const ac = userBehavior.artistPlayCount
  const topGenres   = Object.entries(gc).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0])
  const topArtists  = Object.entries(ac).sort((a,b)=>b[1]-a[1]).slice(0,2).map(e=>e[0])
  const allGenres   = [...new Set(songs.map(s=>s.genre).filter(Boolean))].slice(0,5)

  const items = [
    ...topGenres.map(g  => ({ icon:'fa-headphones', label: g })),
    ...topArtists.map(a => ({ icon:'fa-microphone', label: a })),
    ...allGenres.filter(g => !topGenres.includes(g)).map(g => ({ icon:'fa-music', label: g }))
  ].slice(0, 7)

  if (!items.length) { suggEl.classList.add('hidden'); return }

  suggEl.innerHTML = `
    <div style="font-size:11px;color:#888;padding:8px 14px 4px;background:#f5f5f5">Based on your taste</div>
    ${items.map(item => `
      <div class="suggestion-item" onmousedown="selectSuggestion('${item.label}')">
        <i class="fa ${item.icon}"></i>
        <span>${item.label}</span>
      </div>`).join('')}`
  suggEl.classList.remove('hidden')
}

window.hideSearchSuggestionsDelayed = function() {
  setTimeout(() => document.getElementById('search-suggestions').classList.add('hidden'), 200)
}

window.selectSuggestion = function(label) {
  document.getElementById('search-input').value = label
  document.getElementById('search-suggestions').classList.add('hidden')
  searchSongs()
}

window.clearSearch = function() {
  document.getElementById('search-input').value = ''
  document.getElementById('search-results-wrap').classList.add('hidden')
  document.getElementById('search-empty').style.display = 'block'
  document.getElementById('search-clear-btn').style.display = 'none'
  document.getElementById('search-suggestions').classList.add('hidden')
}

function renderGenreGrid() {
  const genres = [
    {name:"Pop",color:"#e74c3c"},{name:"Hip-Hop",color:"#f39c12"},
    {name:"Rock",color:"#3498db"},{name:"Electronic",color:"#1db954"},
    {name:"Jazz",color:"#9b59b6"},{name:"Classical",color:"#2c3e50"},
    {name:"R&B",color:"#e67e22"},{name:"Bollywood",color:"#c0392b"},
    {name:"Indie",color:"#16a085"},{name:"Podcasts",color:"#8e44ad"}
  ]
  const el = document.getElementById('genre-grid')
  if (!el) return
  el.innerHTML = genres.map(g => `
    <div class="genre-tile ripple" style="background:${g.color}" onclick="selectSuggestion('${g.name}');switchTab('search')">
      ${g.name}<i class="fa fa-music"></i>
    </div>`).join('')
}

// ============================================
// PLAYER
// ============================================
window.playSongById = function(id) {
  const index = songs.findIndex(s => String(s.id) === String(id))
  if (index !== -1) playSong(index)
}

window.playSong = function(index) {
  if (index < 0 || index >= songs.length) return
  currentSongIndex = index
  const song = songs[index]

  userBehavior.genrePlayCount[song.genre]   = (userBehavior.genrePlayCount[song.genre]   || 0) + 1
  userBehavior.artistPlayCount[song.artist] = (userBehavior.artistPlayCount[song.artist]  || 0) + 1
  playHistory.unshift(song)
  if (playHistory.length > 50) playHistory.pop()

  document.getElementById('mini-title').textContent  = song.title
  document.getElementById('mini-artist').textContent = song.artist
  document.getElementById('fp-title').textContent    = song.title
  document.getElementById('fp-artist').textContent   = song.artist

  const fpThumb   = document.getElementById('fp-thumb')
  const miniThumb = document.getElementById('mini-thumb-el')

  if (song.cover_url) {
    fpThumb.innerHTML   = `<img src="${song.cover_url}" alt="${song.title}"/>`
    miniThumb.innerHTML = `<img src="${song.cover_url}" alt="${song.title}"/>`
  } else {
    fpThumb.innerHTML   = `<i class="fa fa-music"></i>`
    miniThumb.innerHTML = `<i class="fa fa-music"></i>`
  }

  if (song.song_url) {
    audio.src = song.song_url
    audio.play().then(() => {
      isPlaying = true
      document.getElementById('mini-player').classList.remove('hidden')
      document.getElementById('mini-player').classList.add('active')
      document.getElementById('mini-play-icon').className = 'fa fa-pause'
      document.getElementById('fp-play-icon').className   = 'fa fa-pause'
      updateLikeUI()
      renderQuickAccess()
      supabase.from('song').update({ plays: (song.plays || 0) + 1 }).eq('id', song.id).then(() => {
        song.plays = (song.plays || 0) + 1
      })
    }).catch(err => {
      console.error('Audio play error:', err)
      alert('Error playing audio. Please check the file URL.')
    })
  } else {
    alert('No audio URL for this song.')
  }
}

window.togglePlay = function() {
  if (audio.paused) {
    audio.play().then(() => {
      isPlaying = true
      document.getElementById('mini-play-icon').className = 'fa fa-pause'
      document.getElementById('fp-play-icon').className   = 'fa fa-pause'
    }).catch(e => console.error(e))
  } else {
    audio.pause()
    isPlaying = false
    document.getElementById('mini-play-icon').className = 'fa fa-play'
    document.getElementById('fp-play-icon').className   = 'fa fa-play'
  }
}

window.nextSong = function() {
  if (!songs.length) return
  playSong((currentSongIndex + 1) % songs.length)
}

window.prevSong = function() {
  if (!songs.length) return
  playSong((currentSongIndex - 1 + songs.length) % songs.length)
}

window.openFullPlayer  = function() { document.getElementById('full-player').classList.remove('hidden'); document.getElementById('full-player').classList.add('active') }
window.closeFullPlayer = function() { document.getElementById('full-player').classList.add('hidden'); document.getElementById('full-player').classList.remove('active') }

audio.addEventListener('ended', () => nextSong())
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return
  const pct = (audio.currentTime / audio.duration) * 100
  document.getElementById('seek-bar').value = pct
  document.getElementById('mini-progress-bar').style.width = pct + '%'
  document.getElementById('time-current').textContent = fmt(audio.currentTime)
  document.getElementById('time-total').textContent   = fmt(audio.duration)
})

function fmt(s) {
  if (isNaN(s)) return '0:00'
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`
}

window.seekTo    = function(v) { if (audio.duration) audio.currentTime = (v/100) * audio.duration }
window.setVolume = function(v) { audio.volume = v/100 }

window.toggleShuffle = function() { document.getElementById('shuffle-btn').classList.toggle('active') }
window.toggleRepeat  = function() { document.getElementById('repeat-btn').classList.toggle('active') }

// ============================================
// LIKE
// ============================================
async function loadLikedSongs() {
  if (!currentUser) return
  try {
    const { data, error } = await supabase.from('liked_songs').select('song_id').eq('user_id', currentUser.id)
    if (error) throw error
    likedSongIds = data.map(item => String(item.song_id))
    updateLikeUI()
    renderLikedList()
  } catch (error) {
    console.error('Error loading liked songs:', error)
  }
}

window.toggleLike = async function() {
  if (!currentUser) return alert('Please login to like songs')
  const song = songs[currentSongIndex]
  if (!song) return
  const songIdStr = String(song.id)

  if (likedSongIds.includes(songIdStr)) {
    await supabase.from('liked_songs').delete().eq('user_id', currentUser.id).eq('song_id', song.id)
    likedSongIds = likedSongIds.filter(id => id !== songIdStr)
  } else {
    await supabase.from('liked_songs').insert({ user_id: currentUser.id, song_id: song.id })
    likedSongIds.push(songIdStr)
  }
  updateLikeUI()
  renderLikedList()
}

function updateLikeUI() {
  const song    = songs[currentSongIndex]
  if (!song) return
  const isLiked = likedSongIds.includes(String(song.id))
  const color   = isLiked ? 'var(--accent)' : 'var(--text-muted)'
  document.getElementById('mini-heart').style.color = color
  document.getElementById('fp-heart').style.color   = color
  document.getElementById('mini-heart').className   = isLiked ? 'fa-solid fa-heart' : 'fa fa-heart'
  document.getElementById('fp-heart').className     = isLiked ? 'fa-solid fa-heart' : 'fa fa-heart'
}

function renderLikedList() {
  const el          = document.getElementById('liked-list')
  if (!el) return
  const likedSongs  = songs.filter(s => likedSongIds.includes(String(s.id)))
  el.innerHTML = likedSongs.length
    ? likedSongs.map(s => songRowHTML(s)).join('')
    : `<div style="color:var(--text-muted);text-align:center;padding:20px;">No liked songs yet.</div>`
}

// ============================================
// PLAYLIST FUNCTIONS
// ============================================
window.createPlaylist = async function() {
  const name = prompt('Enter Playlist Name:')
  if (!name || !name.trim()) return
  try {
    const { error } = await supabase.from('playlists').insert({ user_id: currentUser.id, name: name.trim() })
    if (error) throw error
    alert(`Playlist "${name.trim()}" created!`)
    loadPlaylists()
  } catch (error) {
    alert('Error creating playlist: ' + error.message)
  }
}

async function loadPlaylists() {
  const container = document.getElementById('playlist-list')
  if (!container || !currentUser) return
  try {
    const { data, error } = await supabase
      .from('playlists')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
    if (error) throw error

    if (!data || data.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:20px;">No playlists yet. Create one!</div>`
      return
    }

    container.innerHTML = data.map(pl => `
      <div class="playlist-item ripple" onclick="openPlaylistView(${pl.id}, '${pl.name.replace(/'/g,"\\'")}')">
        <div class="pl-thumb" style="background:#8b5cf6"><i class="fa fa-list" style="color:#fff"></i></div>
        <div class="pl-info">
          <div class="pl-name">${pl.name}</div>
          <div class="pl-count">Tap to view songs</div>
        </div>
        <i class="fa fa-chevron-right" style="color:var(--text-dim)"></i>
      </div>`).join('')
  } catch (error) {
    console.error('Error loading playlists:', error)
  }
}

window.openPlaylistView = async function(playlistId, playlistName) {
  currentViewingPlaylistId   = playlistId
  currentViewingPlaylistName = playlistName

  document.getElementById('playlist-view-title').textContent = playlistName

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById('page-playlist-view').classList.add('active')

  const container = document.getElementById('playlist-view-container')
  container.innerHTML = `
    <div style="color:var(--text-muted);text-align:center;padding:40px;">
      <i class="fa fa-spinner fa-spin" style="font-size:24px;margin-bottom:10px;display:block"></i>
      Loading songs...
    </div>`

  try {
    const { data: plSongs, error } = await supabase
      .from('playlist_songs')
      .select('song_id')
      .eq('playlist_id', playlistId)

    if (error) throw error

    if (!plSongs || plSongs.length === 0) {
      container.innerHTML = `
        <div style="color:var(--text-muted);text-align:center;padding:40px;">
          <i class="fa fa-music" style="font-size:40px;margin-bottom:16px;display:block;color:#333"></i>
          This playlist is empty.<br><br>
          <span style="font-size:13px">Add songs using <b style="color:var(--accent)">Add to Playlist</b> on any song.</span>
        </div>`
      return
    }

    const songIds      = plSongs.map(item => String(item.song_id))
    const playlistSongs = songs.filter(s => songIds.includes(String(s.id)))

    if (playlistSongs.length === 0) {
      container.innerHTML = `
        <div style="color:var(--text-muted);text-align:center;padding:40px;">
          Songs may have been deleted. Add new songs to this playlist.
        </div>`
      return
    }

    container.innerHTML = `
      <div class="song-list" style="padding:0 16px">
        ${playlistSongs.map(song => `
          <div class="song-row" onclick="playSongById('${song.id}')">
            <div class="row-thumb">
              ${song.cover_url ? `<img src="${song.cover_url}" alt="${song.title}"/>` : `<i class="fa fa-music"></i>`}
            </div>
            <div class="row-info">
              <div class="row-title">${song.title}</div>
              <div class="row-artist">${song.artist} • ${song.genre || ''}</div>
            </div>
            <button class="delete-btn" onclick="event.stopPropagation();removeSongFromPlaylist(${playlistId},'${song.id}','${playlistName.replace(/'/g,"\\'")}')">
              Remove
            </button>
          </div>`).join('')}
      </div>`

  } catch (error) {
    container.innerHTML = `<div style="color:var(--danger);padding:20px;">Error loading playlist: ${error.message}</div>`
    console.error('Error loading playlist songs:', error)
  }
}

window.addCurrentSongToPlaylist = async function(songIdParam = null) {
  if (!currentUser) return alert('Please login')

  let songId = songIdParam
  if (!songId) {
    const current = songs[currentSongIndex]
    if (!current) return alert('No song is currently playing')
    songId = current.id
  }

  const song = songs.find(s => String(s.id) === String(songId))
  if (!song) return alert('Song not found')

  try {
    const { data: playlists, error } = await supabase
      .from('playlists')
      .select('id, name')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    if (!playlists || playlists.length === 0) {
      const wantCreate = confirm('You have no playlists. Create one now?')
      if (wantCreate) createPlaylist()
      return
    }

    const modal = document.getElementById('settings-modal')
    document.getElementById('modal-title').textContent = `Add "${song.title}" to playlist`
    document.getElementById('modal-body').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
        ${playlists.map(pl => `
          <div class="playlist-option-item ripple" onclick="confirmAddToPlaylist('${songId}',${pl.id},'${pl.name.replace(/'/g,"\\'")}')">
            <i class="fa fa-list"></i>
            <span>${pl.name}</span>
          </div>`).join('')}
        <button onclick="window.closeSettingsModal()"
          style="width:100%;margin-top:10px;background:transparent;border:1px solid #555;color:var(--text-muted);padding:12px;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer;">
          Cancel
        </button>
      </div>`
    modal.classList.remove('hidden')
    modal.classList.add('active')

  } catch (error) {
    alert('Error loading playlists: ' + error.message)
  }
}

window.confirmAddToPlaylist = async function(songId, playlistId, playlistName) {
  window.closeSettingsModal()
  try {
    const { data: existing } = await supabase
      .from('playlist_songs')
      .select('id')
      .eq('playlist_id', playlistId)
      .eq('song_id', songId)

    if (existing && existing.length > 0) {
      alert('This song is already in that playlist!')
      return
    }

    const { error } = await supabase.from('playlist_songs').insert({ playlist_id: playlistId, song_id: songId })
    if (error) throw error

    const song = songs.find(s => String(s.id) === String(songId))
    alert(`✅ "${song?.title || 'Song'}" added to "${playlistName}"!`)

    if (currentViewingPlaylistId === playlistId) {
      openPlaylistView(playlistId, playlistName)
    }
  } catch (error) {
    alert('Error adding song: ' + error.message)
  }
}

window.removeSongFromPlaylist = async function(playlistId, songId, playlistName) {
  if (!confirm('Remove this song from playlist?')) return
  try {
    const { error } = await supabase
      .from('playlist_songs')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('song_id', songId)
    if (error) throw error
    openPlaylistView(playlistId, playlistName || currentViewingPlaylistName)
  } catch (error) {
    alert('Error removing song: ' + error.message)
  }
}

window.closeSettingsModal = function() {
  const modal = document.getElementById('settings-modal')
  if (modal) {
    modal.classList.add('hidden')
    modal.classList.remove('active')
  }
}

window.openSettingsModal = function(type) {
  const c = {
    account: { t:'Account', b:`<h4>Account Details</h4><p><b>Email/Phone:</b> ${currentUser?.email || currentUser?.phone || '-'}</p><p><b>Role:</b> ${document.getElementById('profile-role-label').textContent}</p>` },
    version: { t:'Version', b:`<div class="version-tag">v1.0.0</div><h4 style="margin-top:14px">Audivo</h4><p>© 2026 Audivo. All rights reserved.</p>` },
    support: { t:'Support', b:`<h4>Contact Us</h4><p>📧 support@audivo.app</p><p>We typically respond within 24 hours.</p>` },
    terms:   { t:'Terms of Use', b:`<h4>Terms of Use</h4><p>By using Audivo, you agree to use this app for personal, non-commercial purposes only.</p>` },
    privacy: { t:'Privacy Policy', b:`<h4>Privacy Policy</h4><p>Audivo does not share your personal data with third parties. All data is handled securely via Supabase.</p>` }
  }[type]
  if (!c) return
  document.getElementById('modal-title').textContent = c.t
  document.getElementById('modal-body').innerHTML    = c.b
  const modal = document.getElementById('settings-modal')
  modal.classList.remove('hidden')
  modal.classList.add('active')
}

// ============================================
// UPLOAD SONG (Admin)
// ============================================
window.handleUpload = async function() {
  const title     = document.getElementById('song-title').value.trim()
  const artist    = document.getElementById('song-artist').value.trim()
  const genre     = document.getElementById('song-genre').value
  const songFile  = document.getElementById('file-input').files[0]
  const coverFile = document.getElementById('cover-input').files[0]
  const isNewRel  = document.getElementById('is-new-release').checked

  if (!title || !artist)  { alert('Please fill title and artist'); return }
  if (!songFile)           { alert('Please select an audio file'); return }

  const btn          = document.querySelector('#page-upload .btn-primary')
  const originalHTML = btn.innerHTML
  btn.innerHTML      = '<i class="fa fa-spinner fa-spin"></i> Uploading...'
  btn.disabled       = true

  try {
    const audioExt  = songFile.name.split('.').pop()
    const audioPath = `songs/${Date.now()}_${title.replace(/\s/g,'_')}.${audioExt}`
    const { error: audioErr } = await supabase.storage.from('song').upload(audioPath, songFile)
    if (audioErr) throw audioErr
    const { data: audioData } = supabase.storage.from('song').getPublicUrl(audioPath)

    let coverUrl = null
    if (coverFile) {
      const coverExt  = coverFile.name.split('.').pop()
      const coverPath = `covers/${Date.now()}_${title.replace(/\s/g,'_')}.${coverExt}`
      const { error: coverErr } = await supabase.storage.from('covers').upload(coverPath, coverFile)
      if (!coverErr) {
        const { data: coverData } = supabase.storage.from('covers').getPublicUrl(coverPath)
        coverUrl = coverData.publicUrl
      }
    }

    const { error: dbErr } = await supabase.from('song').insert({
      title, artist,
      genre:          genre || 'Pop',
      song_url:       audioData.publicUrl,
      cover_url:      coverUrl,
      is_new_release: isNewRel,
      plays:          0
    })
    if (dbErr) throw dbErr

    document.getElementById('upload-success').classList.remove('hidden')
    setTimeout(() => document.getElementById('upload-success').classList.add('hidden'), 3000)

    document.getElementById('song-title').value  = ''
    document.getElementById('song-artist').value = ''
    document.getElementById('song-genre').value  = ''
    document.getElementById('file-input').value  = ''
    document.getElementById('cover-input').value = ''
    document.getElementById('is-new-release').checked = false
    document.getElementById('audio-preview-wrap').classList.add('hidden')
    document.getElementById('cover-preview-img').classList.add('hidden')
    document.getElementById('cover-placeholder').style.display = 'flex'
    document.getElementById('drop-zone').classList.remove('file-selected')
    document.getElementById('drop-zone-text').textContent = 'Tap to select audio file'

    await loadSongs()

  } catch (error) {
    alert('Upload failed: ' + error.message)
    console.error('Upload error:', error)
  }

  btn.innerHTML = originalHTML
  btn.disabled  = false
}

window.handleCoverSelect = function(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    document.getElementById('cover-preview-img').src = ev.target.result
    document.getElementById('cover-preview-img').classList.remove('hidden')
    document.getElementById('cover-placeholder').style.display = 'none'
  }
  reader.readAsDataURL(file)
}

window.handleFileSelect = function(e) {
  const file = e.target.files[0]
  if (!file) return
  document.getElementById('audio-preview').src = URL.createObjectURL(file)
  document.getElementById('audio-preview-wrap').classList.remove('hidden')
  document.getElementById('drop-zone-text').textContent = '✅ ' + file.name
  document.getElementById('drop-zone').classList.add('file-selected')
  if (!document.getElementById('song-title').value) {
    document.getElementById('song-title').value = file.name.replace(/\.[^/.]+$/,'').replace(/[-_]/g,' ')
  }
}

// ============================================
// DELETE SONG (Admin)
// ============================================
window.searchSongsToDelete = function() {
  const query     = document.getElementById('delete-song-search').value.trim().toLowerCase()
  const container = document.getElementById('delete-song-list')
  const filtered  = songs.filter(s =>
    s.title.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query)
  )
  if (!filtered.length) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:10px;">No songs found.</div>`
    return
  }
  container.innerHTML = filtered.map(song => `
    <div class="delete-song-item">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:4px;overflow:hidden;background:var(--surface2);flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          ${song.cover_url ? `<img src="${song.cover_url}" style="width:100%;height:100%;object-fit:cover"/>` : `<i class="fa fa-music" style="font-size:12px;color:var(--accent)"></i>`}
        </div>
        <div>
          <div style="font-weight:600;font-size:13px;">${song.title}</div>
          <div style="font-size:11px;color:var(--text-muted);">${song.artist}</div>
        </div>
      </div>
      <button class="delete-btn" onclick="deleteSong('${song.id}','${song.title.replace(/'/g,"\\'")}')">Delete</button>
    </div>`).join('')
}

window.deleteSong = async function(songId, title) {
  if (!confirm(`Delete "${title}"?`)) return
  try {
    const { error } = await supabase.from('song').delete().eq('id', songId)
    if (error) throw error
    alert('Song deleted!')
    document.getElementById('delete-song-search').value = ''
    document.getElementById('delete-song-list').innerHTML = ''
    await loadSongs()
  } catch (error) {
    alert('Error deleting: ' + error.message)
  }
}

// ============================================
// NAVIGATION
// ============================================
window.switchTab = function(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  const page = document.getElementById('page-' + tab)
  if (page) page.classList.add('active')
  const nav = document.getElementById('nav-' + tab)
  if (nav) nav.classList.add('active')
  document.getElementById('profile-menu').classList.add('hidden')
  if (tab === 'home')    renderHome()
  if (tab === 'library') { loadPlaylists(); renderLikedList(); renderFollowedArtists() }
  if (tab === 'search')  renderGenreGrid()
}

window.showProfilePage = function(page) {
  document.getElementById('profile-menu').classList.add('hidden')
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  const el = document.getElementById('page-' + page)
  if (el) el.classList.add('active')
  if (page === 'admin-panel') loadAllUsers()
  if (page === 'your-update') renderYourUpdate()
  if (page === 'recent-page') renderRecentPage()
}

window.goBack = function() { switchTab('home') }

window.toggleProfileMenu = function() {
  document.getElementById('profile-menu').classList.toggle('hidden')
}

document.addEventListener('click', e => {
  const menu   = document.getElementById('profile-menu')
  const avatar = document.querySelector('.avatar')
  if (menu && !menu.contains(e.target) && avatar && !avatar.contains(e.target)) {
    menu.classList.add('hidden')
  }
})

window.setFilter = function(f) {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'))
  document.getElementById('pill-' + f).classList.add('active')
}

window.showLibTab = function(tab, btn) {
  document.querySelectorAll('.lib-tab').forEach(t => { t.classList.add('hidden'); t.classList.remove('active') })
  document.querySelectorAll('.lib-pill').forEach(b => b.classList.remove('active'))
  const el = document.getElementById('lib-' + tab)
  if (el) { el.classList.remove('hidden'); el.classList.add('active') }
  if (btn) btn.classList.add('active')
  if (tab === 'artists') renderFollowedArtists()
  if (tab === 'liked')   renderLikedList()
  if (tab === 'history') renderRecentPage()
}

// ============================================
// YOUR UPDATE / RECENT
// ============================================
function renderYourUpdate() {
  const letter = currentUser?.email?.[0]?.toUpperCase() || currentUser?.phone?.[0]?.toUpperCase() || 'U'
  document.getElementById('update-avatar').textContent    = letter
  document.getElementById('update-name').textContent      = currentUser?.email || currentUser?.phone || '-'
  document.getElementById('update-role').textContent      = document.getElementById('profile-role-label').textContent
  document.getElementById('stat-songs').textContent       = playHistory.length
  document.getElementById('stat-liked').textContent       = likedSongIds.length
  const gc  = userBehavior.genrePlayCount
  const ac  = userBehavior.artistPlayCount
  document.getElementById('top-genre-badge').textContent  = Object.keys(gc).length ? Object.entries(gc).sort((a,b)=>b[1]-a[1])[0][0] : 'Play some songs!'
  document.getElementById('top-artist-badge').textContent = Object.keys(ac).length ? Object.entries(ac).sort((a,b)=>b[1]-a[1])[0][0] : 'Play some songs!'
}

function renderRecentPage() {
  const el   = document.getElementById('recent-song-list') || document.getElementById('history-list')
  if (!el) return
  const seen = new Set()
  const uniq = playHistory.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true }).slice(0, 20)
  el.innerHTML = uniq.length
    ? uniq.map(s => songRowHTML(s)).join('')
    : `<div style="color:var(--text-muted);text-align:center;padding:20px;">Nothing played yet.</div>`
}

function songRowHTML(s) {
  return `
    <div class="song-row" onclick="playSongById('${s.id}')">
      <div class="row-thumb">
        ${s.cover_url ? `<img src="${s.cover_url}" alt="${s.title}"/>` : `<i class="fa fa-music"></i>`}
      </div>
      <div class="row-info">
        <div class="row-title">${s.title}</div>
        <div class="row-artist">${s.artist} • ${s.genre || ''}</div>
      </div>
      <button onclick="event.stopPropagation();addCurrentSongToPlaylist('${s.id}')"
        style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:6px;">
        <i class="fa fa-plus-circle"></i>
      </button>
    </div>`
}

window.editProfile = function() {
  const name = prompt('New display name:')
  if (name && name.trim()) document.getElementById('update-name').textContent = name.trim()
}

window.setQuality = function(q) {
  document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('q-' + q.toLowerCase()).classList.add('active')
  document.getElementById('quality-sub').textContent = q
}

window.saveSetting = function(key, val) { console.log('Setting:', key, val) }

// ============================================
// SESSION CHECK
// ============================================
async function checkSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) { currentUser = session.user; onAuthSuccess(session.user) }
  } catch (error) {
    console.error('Session check error:', error)
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    currentUser = session.user
    onAuthSuccess(session.user)
  } else if (event === 'SIGNED_OUT') {
    currentUser = null
    songs = []
    document.getElementById('login-screen').style.display = 'flex'
    document.getElementById('app').classList.add('hidden')
    document.getElementById('mini-player').classList.add('hidden')
  }
})

checkSession()
console.log('🔥 Audivo Pro ready!')