// ============================================
// 🔥 SUPABASE CLIENT
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
let currentSongIndex = 0
let audio = new Audio()
let isPlaying = false
let currentPlaylistId = null
let likedSongIds = []

// ============================================
// AUTH FUNCTIONS
// ============================================
window.switchAuthTab = function(tab) {
  const loginForm = document.getElementById('login-form')
  const signupForm = document.getElementById('signup-form')
  const loginBtn = document.getElementById('tab-login-btn')
  const signupBtn = document.getElementById('tab-signup-btn')
  
  if (tab === 'login') {
    loginForm.classList.remove('hidden')
    signupForm.classList.add('hidden')
    loginBtn.classList.add('active')
    signupBtn.classList.remove('active')
  } else {
    loginForm.classList.add('hidden')
    signupForm.classList.remove('hidden')
    signupBtn.classList.add('active')
    loginBtn.classList.remove('active')
  }
}

window.handleSignup = async function() {
  const email = document.getElementById('signup-email').value.trim()
  const password = document.getElementById('signup-password').value.trim()
  const errorEl = document.getElementById('signup-error')
  errorEl.textContent = ''
  
  if (!email || !password) { errorEl.textContent = 'Please fill all fields'; return }
  if (password.length < 6) { errorEl.textContent = 'Password must be at least 6 characters'; return }
  
  try {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    alert('✅ Account created! Please check your email to verify.')
    switchAuthTab('login')
    document.getElementById('login-email').value = email
  } catch (error) {
    errorEl.textContent = error.message
    console.error('Signup error:', error)
  }
}

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
    console.error('Login error:', error)
  }
}

window.handleGoogleLogin = async function() {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    if (error) throw error
  } catch (error) {
    alert('Google login error: ' + error.message)
  }
}

window.handleLogout = async function() {
  try {
    await supabase.auth.signOut()
    currentUser = null
    songs = []
    document.getElementById('login-screen').style.display = 'flex'
    document.getElementById('app').classList.add('hidden')
    document.getElementById('mini-player').classList.add('hidden')
  } catch (error) {
    alert('Logout error: ' + error.message)
  }
}

// ------------------- ON AUTH SUCCESS -------------------
function onAuthSuccess(user) {
  currentUser = user
  document.getElementById('login-screen').style.display = 'none'
  const app = document.getElementById('app')
  app.classList.remove('hidden')
  app.style.display = 'flex'
  
  const avatarLetter = user.email[0].toUpperCase()
  document.getElementById('avatar-letter').textContent = avatarLetter
  document.getElementById('pm-avatar-letter').textContent = avatarLetter
  document.getElementById('profile-name-label').textContent = user.email
  document.getElementById('profile-role-label').textContent = '🎵 Listener'
  
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'))
  
  document.getElementById('made-for-label').textContent = `Made For ${user.email.split('@')[0]}`
  
  checkIfAdmin(user.id, user.email)
  loadSongs()
  loadLikedSongs()
}

// ============================================
// ADMIN CHECK & PANEL FUNCTIONS
// ============================================
async function checkIfAdmin(userId, email) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    let isAdmin = false
    if (data && data.role === 'admin') {
      isAdmin = true
    } else if (email === 'admin@audivo.com') {
      isAdmin = true
      try {
        await supabase.from('profiles').upsert({ id: userId, role: 'admin' })
      } catch (e) {}
    }

    if (isAdmin) {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'))
      document.getElementById('profile-role-label').textContent = '👑 Administrator'
      loadAllUsers() 
    }
  } catch (error) {
    console.log('Admin check error:', error.message)
  }
}

async function loadAllUsers() {
  try {
    const { data: userList, error: userError } = await supabase.from('auth.users').select('id, email')
    if (userError) throw userError

    const { data: profileList, error: profileError } = await supabase.from('profiles').select('id, role')
    if (profileError) throw profileError

    const data = userList.map(user => {
      const profile = profileList.find(p => p.id === user.id)
      return { ...user, role: profile?.role || 'user' }
    })
    
    const container = document.getElementById('all-users-list')
    if (!container) return
    
    container.innerHTML = data.map(user => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #333;">
        <div>
          <div style="font-weight:600;">${user.email}</div>
          <div style="font-size:12px; color:var(--text-muted);">Role: ${user.role || 'user'}</div>
        </div>
        ${user.email !== 'admin@audivo.com' ? `
          <button class="ripple" onclick="toggleAdminRole('${user.id}', '${user.role || 'user'}')" style="background:${user.role === 'admin' ? 'var(--accent)' : '#444'}; border:none; color:#000; padding:5px 12px; border-radius:50px; font-weight:bold; cursor:pointer;">
            ${user.role === 'admin' ? '✓ Admin' : 'Make Admin'}
          </button>
        ` : `<span style="color:var(--accent); font-weight:bold;">⭐ Super Admin</span>`}
      </div>
    `).join('')
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
// SONGS FUNCTIONS & SMART HOME
// ============================================
async function loadSongs() {
  try {
    const { data, error } = await supabase
      .from('song')
      .select('*')
    
    if (error) throw error
    songs = data || []
    renderSongs()
  } catch (error) {
    console.error('Load songs error:', error)
  }
}

function renderSongs() {
  const container = document.getElementById('songs-container')
  if (!container) return

  const renderRow = (id, array, max = 10) => {
    const el = document.getElementById(id)
    if (!el) return
    if (!array || array.length === 0) {
      el.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:10px;">No songs yet</div>`
      return
    }
    el.innerHTML = array.slice(0, max).map((song, idx) => `
      <div class="h-card">
        <div class="h-thumb" onclick="playSongById('${song.id}')">
          ${song.cover_url ? `<img src="${song.cover_url}" alt="${song.title}" />` : `<i class="fa fa-music"></i>`}
          <div class="play-over"><i class="fa fa-play-circle"></i></div>
        </div>
        <div class="h-card-label">${song.title}</div>
        <div class="h-card-sub">${song.artist}</div>
        ${song.is_new_release ? '<div class="new-badge">🔥 NEW</div>' : ''}
        
        <!-- 🆕 ADD TO PLAYLIST BUTTON -->
        <button class="ripple" onclick="event.stopPropagation(); addSongToPlaylist('${song.id}')" style="background:var(--surface3); border:none; color:var(--text-muted); font-size:10px; padding:4px 8px; border-radius:12px; margin-top:6px; cursor:pointer;">
          <i class="fa fa-plus"></i> Playlist
        </button>
      </div>
    `).join('')
  }

  if (songs.length === 0) {
    document.getElementById('home-content').classList.add('hidden')
    document.getElementById('home-empty-state').classList.remove('hidden')
    return
  }

  document.getElementById('home-content').classList.remove('hidden')
  document.getElementById('home-empty-state').classList.add('hidden')

  const recentlyUploaded = [...songs].sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
  const newReleases = songs.filter(s => s.is_new_release === true)
  const popular = [...songs].sort((a,b) => b.plays - a.plays)
  const madeForYou = [...songs].sort(() => Math.random() - 0.5)

  renderRow('recent-upload-list', recentlyUploaded, 10)
  renderRow('new-release-list', newReleases, 10)
  renderRow('popular-songs-list', popular, 10)
  renderRow('made-for-list', madeForYou, 10)
  renderRow('all-songs-list', songs, 20)
}

// ============================================
// SEARCH FUNCTION
// ============================================
window.searchSongs = function() {
  const query = document.getElementById('search-input').value.trim().toLowerCase()
  const resultsContainer = document.getElementById('search-results')
  const emptyContainer = document.getElementById('search-empty')
  const resultsWrap = document.getElementById('search-results-wrap')
  const countLabel = document.getElementById('results-count')

  if (query.length === 0) {
    resultsWrap.classList.add('hidden')
    emptyContainer.style.display = 'block'
    return
  }

  emptyContainer.style.display = 'none'
  resultsWrap.classList.remove('hidden')

  const filtered = songs.filter(song => 
    song.title.toLowerCase().includes(query) ||
    song.artist.toLowerCase().includes(query) ||
    song.genre.toLowerCase().includes(query)
  )

  countLabel.textContent = `${filtered.length} results found`
  
  if(filtered.length === 0) {
      resultsContainer.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:20px;">No matching songs found.</div>`
      return
  }

  resultsContainer.innerHTML = filtered.map(song => `
    <div class="song-row" onclick="playSongById('${song.id}')">
      <div class="row-thumb">${song.cover_url ? `<img src="${song.cover_url}" />` : `<i class="fa fa-music"></i>`}</div>
      <div class="row-info">
        <div class="row-title">${song.title}</div>
        <div class="row-artist">${song.artist} • ${song.genre}</div>
      </div>
    </div>
  `).join('')
}

window.clearSearch = function() {
  document.getElementById('search-input').value = ''
  document.getElementById('search-results-wrap').classList.add('hidden')
  document.getElementById('search-empty').style.display = 'block'
}

// ============================================
// PLAYER FUNCTIONS WITH TIME & ART
// ============================================
window.playSongById = function(id) {
  // FIX: Convert to String to handle Number vs String ID mismatch
  const index = songs.findIndex(s => String(s.id) === String(id))
  if (index !== -1) playSong(index)
}

window.playSong = function(index) {
  if (index < 0 || index >= songs.length) return
  currentSongIndex = index
  const song = songs[index]
  
  document.getElementById('mini-title').textContent = song.title
  document.getElementById('mini-artist').textContent = song.artist
  document.getElementById('fp-title').textContent = song.title
  document.getElementById('fp-artist').textContent = song.artist

  const fpThumb = document.getElementById('fp-thumb')
  if (song.cover_url) {
    fpThumb.innerHTML = `<img src="${song.cover_url}" />`
  } else {
    fpThumb.innerHTML = `<i class="fa fa-music"></i>`
  }
  
  const miniThumb = document.getElementById('mini-thumb-el')
  if (song.cover_url) {
    miniThumb.innerHTML = `<img src="${song.cover_url}" />`
  } else {
    miniThumb.innerHTML = `<i class="fa fa-music"></i>`
  }
  
  audio.src = song.song_url
  audio.play()
  isPlaying = true
  
  document.getElementById('mini-player').classList.remove('hidden')
  document.getElementById('mini-player').classList.add('active')
  document.getElementById('mini-play-icon').className = 'fa fa-pause'
  document.getElementById('fp-play-icon').className = 'fa fa-pause'
  
  updateLikeUI()
}

window.togglePlay = function() {
  if (audio.paused) {
    audio.play()
    isPlaying = true
    document.getElementById('mini-play-icon').className = 'fa fa-pause'
    document.getElementById('fp-play-icon').className = 'fa fa-pause'
  } else {
    audio.pause()
    isPlaying = false
    document.getElementById('mini-play-icon').className = 'fa fa-play'
    document.getElementById('fp-play-icon').className = 'fa fa-play'
  }
}

window.nextSong = function() {
  if (songs.length === 0) return
  const next = (currentSongIndex + 1) % songs.length
  playSong(next)
}

window.prevSong = function() {
  if (songs.length === 0) return
  const prev = (currentSongIndex - 1 + songs.length) % songs.length
  playSong(prev)
}

window.openFullPlayer = function() {
  document.getElementById('full-player').classList.remove('hidden')
  document.getElementById('full-player').classList.add('active')
}

window.closeFullPlayer = function() {
  document.getElementById('full-player').classList.add('hidden')
  document.getElementById('full-player').classList.remove('active')
}

audio.addEventListener('ended', () => {
  nextSong()
})

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return
  const pct = (audio.currentTime / audio.duration) * 100
  document.getElementById('seek-bar').value = pct
  document.getElementById('mini-progress-bar').style.width = pct + '%'
  
  document.getElementById('time-current').textContent = fmt(audio.currentTime)
  document.getElementById('time-total').textContent = fmt(audio.duration)
})

function fmt(s) {
  if (isNaN(s)) return '0:00'
  const m = Math.floor(s/60)
  const sec = Math.floor(s%60).toString().padStart(2, '0')
  return m + ':' + sec
}

// ============================================
// LIKE FUNCTION
// ============================================
async function loadLikedSongs() {
  if (!currentUser) return
  try {
    const { data, error } = await supabase
      .from('liked_songs')
      .select('song_id')
      .eq('user_id', currentUser.id)
    if (error) throw error
    likedSongIds = data.map(item => item.song_id)
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
  
  if (likedSongIds.includes(song.id)) {
    try {
      await supabase
        .from('liked_songs')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('song_id', song.id)
      likedSongIds = likedSongIds.filter(id => id !== song.id)
      updateLikeUI()
      renderLikedList()
    } catch (error) { alert('Error unliking: ' + error.message) }
  } else {
    try {
      await supabase
        .from('liked_songs')
        .insert({ user_id: currentUser.id, song_id: song.id })
      likedSongIds.push(song.id)
      updateLikeUI()
      renderLikedList()
    } catch (error) { alert('Error liking: ' + error.message) }
  }
}

function updateLikeUI() {
  const song = songs[currentSongIndex]
  if (!song) return
  const isLiked = likedSongIds.includes(song.id)
  const iconClass = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'
  const color = isLiked ? 'var(--accent)' : 'var(--text-muted)'
  
  document.getElementById('mini-heart').className = iconClass
  document.getElementById('mini-heart').style.color = color
  document.getElementById('fp-heart').className = iconClass
  document.getElementById('fp-heart').style.color = color
}

function renderLikedList() {
  const container = document.getElementById('liked-list')
  if (!container) return
  const likedSongs = songs.filter(s => likedSongIds.includes(s.id))
  if (likedSongs.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:20px;">No liked songs yet.</div>`
    return
  }
  container.innerHTML = likedSongs.map(song => `
    <div class="song-row" onclick="playSongById('${song.id}')">
      <div class="row-thumb">${song.cover_url ? `<img src="${song.cover_url}" />` : `<i class="fa fa-music"></i>`}</div>
      <div class="row-info">
        <div class="row-title">${song.title}</div>
        <div class="row-artist">${song.artist}</div>
      </div>
    </div>
  `).join('')
}

// ============================================
// PLAYLIST FUNCTIONS (FIXED)
// ============================================
window.createPlaylist = async function() {
  const name = prompt('Enter Playlist Name:')
  if (!name || name.trim() === '') return
  
  try {
    const { data, error } = await supabase
      .from('playlists')
      .insert({ user_id: currentUser.id, name: name.trim() })
      .select()
    if (error) throw error
    alert('Playlist "' + name.trim() + '" created!')
    loadPlaylists()
  } catch (error) {
    alert('Error creating playlist: ' + error.message)
  }
}

async function loadPlaylists() {
  const container = document.getElementById('playlist-list')
  if (!container) return
  
  try {
    const { data, error } = await supabase
      .from('playlists')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    
    if (data.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:20px;">No playlists created yet.</div>`
      return
    }
    
    container.innerHTML = data.map(pl => `
      <div class="playlist-item" onclick="showPlaylistSongs(${pl.id}, '${pl.name}')">
        <div class="pl-thumb"><i class="fa fa-list"></i></div>
        <div class="pl-info">
          <div class="pl-name">${pl.name}</div>
          <div class="pl-count">Tap to view</div>
        </div>
      </div>
    `).join('')
  } catch (error) {
    console.error('Error loading playlists:', error)
  }
}

async function showPlaylistSongs(playlistId, playlistName) {
  try {
    const { data, error } = await supabase
      .from('playlist_songs')
      .select('song_id')
      .eq('playlist_id', playlistId)
    if (error) throw error

    const songIds = data.map(item => item.song_id)
    const playlistSongs = songs.filter(s => songIds.includes(s.id))

    if (playlistSongs.length === 0) {
      alert(`Playlist "${playlistName}" is empty. Add some songs from Home page!`)
      return
    }
    
    let message = `🎵 ${playlistName} (${playlistSongs.length} songs)\n\n`
    playlistSongs.forEach((s, i) => {
      message += `${i+1}. ${s.title} - ${s.artist}\n`
    })
    message += `\nEnter the number of the song you want to play:`
    
    const choice = prompt(message)
    if (choice !== null && !isNaN(choice) && choice > 0 && choice <= playlistSongs.length) {
      const index = songs.findIndex(s => String(s.id) === String(playlistSongs[choice-1].id))
      if (index !== -1) playSong(index)
    }
    
  } catch (error) {
    console.error('Error fetching playlist songs:', error)
  }
}

window.addSongToPlaylist = async function(songId) {
  if (!currentUser) return alert('Please login')
  
  const { data: playlists, error } = await supabase
    .from('playlists')
    .select('id, name')
    .eq('user_id', currentUser.id)
    
  if (error) return alert('Error loading playlists')
  if (playlists.length === 0) return alert('You have no playlists. Create one first!')
  
  let options = playlists.map((p, i) => `${i+1}. ${p.name}`).join('\n')
  const choice = prompt(`Select a playlist to add this song to:\n\n${options}`)
  
  if (choice !== null && !isNaN(choice) && choice > 0 && choice <= playlists.length) {
    const selectedPlaylist = playlists[choice-1]
    
    const { data: existing } = await supabase
      .from('playlist_songs')
      .select('id')
      .eq('playlist_id', selectedPlaylist.id)
      .eq('song_id', songId)

    if (existing && existing.length > 0) {
      return alert('This song is already in that playlist!')
    }
    
    const { error: addError } = await supabase
      .from('playlist_songs')
      .insert({ playlist_id: selectedPlaylist.id, song_id: songId })
      
    if (addError) return alert('Error adding song: ' + addError.message)
    const songTitle = songs.find(s => String(s.id) === String(songId))?.title
    alert(`✅ "${songTitle}" added to "${selectedPlaylist.name}"!`)
  }
}

// ============================================
// UPLOAD & DELETE SONGS
// ============================================
window.handleUpload = async function() {
  const title = document.getElementById('song-title').value.trim()
  const artist = document.getElementById('song-artist').value.trim()
  const genre = document.getElementById('song-genre').value
  const songFile = document.getElementById('file-input').files[0]
  const coverFile = document.getElementById('cover-input').files[0]
  const status = document.getElementById('upload-success')
  
  if (!title || !artist) { alert('⚠️ Please fill title and artist'); return }
  if (!songFile) { alert('⚠️ Please select an audio file'); return }
  
  const btn = document.querySelector('.btn-primary')
  const originalText = btn.innerHTML
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Uploading...'
  btn.disabled = true
  
  try {
    const audioExt = songFile.name.split('.').pop();
    const audioPath = `songs/${Date.now()}_${title.replace(/\s/g, '_')}.${audioExt}`;
    
    const { error: audioError } = await supabase.storage
      .from('song') 
      .upload(audioPath, songFile);

    if (audioError) throw audioError;

    const { data: audioData } = supabase.storage
      .from('song') 
      .getPublicUrl(audioPath);
      
    const audioUrl = audioData.publicUrl;

    let coverUrl = null;
    if (coverFile) {
      const coverExt = coverFile.name.split('.').pop();
      const coverPath = `covers/${Date.now()}_${title.replace(/\s/g, '_')}.${coverExt}`;
      
      const { error: coverError } = await supabase.storage
        .from('covers') 
        .upload(coverPath, coverFile);
      
      if (!coverError) {
        const { data: coverData } = supabase.storage
          .from('covers')
          .getPublicUrl(coverPath);
        coverUrl = coverData.publicUrl;
      }
    }
    
    const { error: dbError } = await supabase
      .from('song')
      .insert({
        title,
        artist,
        genre: genre || 'Pop',
        song_url: audioUrl,
        cover_url: coverUrl,
        is_new_release: document.getElementById('is-new-release').checked || false,
        plays: 0
      })
    
    if (dbError) throw dbError
    
    status.classList.remove('hidden')
    
    document.getElementById('song-title').value = ''
    document.getElementById('song-artist').value = ''
    document.getElementById('song-genre').value = ''
    document.getElementById('file-input').value = ''
    document.getElementById('cover-input').value = ''
    document.getElementById('audio-preview-wrap').classList.add('hidden')
    document.getElementById('cover-preview-img').classList.add('hidden')
    document.getElementById('cover-placeholder').style.display = 'flex'
    document.getElementById('is-new-release').checked = false
    
    setTimeout(() => {
      status.classList.add('hidden')
    }, 3000)
    
    loadSongs()
    
  } catch (error) {
    alert('❌ Upload failed: ' + error.message)
    console.error('Upload error:', error)
  }
  
  btn.innerHTML = originalText
  btn.disabled = false
}

window.searchSongsToDelete = function() {
  const query = document.getElementById('delete-song-search').value.trim().toLowerCase()
  const container = document.getElementById('delete-song-list')
  
  const filtered = songs.filter(s => 
    s.title.toLowerCase().includes(query) ||
    s.artist.toLowerCase().includes(query)
  )
  
  if (filtered.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">No songs found.</div>`
    return
  }
  
  container.innerHTML = filtered.map(song => `
    <div class="delete-song-item">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:30px; height:30px; border-radius:4px; overflow:hidden; background:var(--surface2);">
          ${song.cover_url ? `<img src="${song.cover_url}" style="width:100%; height:100%; object-fit:cover;"/>` : `<i class="fa fa-music" style="display:flex; justify-content:center; align-items:center; height:100%; font-size:12px;"></i>`}
        </div>
        <div>
          <div style="font-weight:600; font-size:13px;">${song.title}</div>
          <div style="font-size:11px; color:var(--text-muted);">${song.artist}</div>
        </div>
      </div>
      <button class="delete-btn" onclick="deleteSong(${song.id}, '${song.title}')">Delete</button>
    </div>
  `).join('')
}

window.deleteSong = async function(songId, title) {
  if (!confirm(`Are you sure you want to delete "${title}"?`)) return
  
  try {
    const { error } = await supabase
      .from('song')
      .delete()
      .eq('id', songId)
      
    if (error) throw error
    
    alert('Song deleted successfully!')
    document.getElementById('delete-song-search').value = ''
    document.getElementById('delete-song-list').innerHTML = ''
    loadSongs()
  } catch (error) {
    alert('Error deleting song: ' + error.message)
  }
}

// ============================================
// DUMMY / UI FUNCTIONS
// ============================================
window.toggleProfileMenu = function() {
  document.getElementById('profile-menu').classList.toggle('hidden')
}

window.switchTab = function(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  const page = document.getElementById('page-' + tab)
  if (page) page.classList.add('active')
  const nav = document.getElementById('nav-' + tab)
  if (nav) nav.classList.add('active')
  
  if (tab === 'home') renderSongs()
  if (tab === 'library') { loadPlaylists(); renderLikedList(); }
}

window.goBack = function() {
  switchTab('home')
}

window.showProfilePage = function(page) {
  document.getElementById('profile-menu').classList.add('hidden')
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  const el = document.getElementById('page-' + page)
  if (el) el.classList.add('active')
  if (page === 'admin-panel' && currentUser?.email === 'admin@audivo.com') {
    loadAllUsers()
  }
}

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
}

window.toggleShuffle = function() {
  document.getElementById('shuffle-btn').classList.toggle('active')
}
window.toggleRepeat = function() {
  const btn = document.getElementById('repeat-btn')
  btn.classList.toggle('active')
}
window.seekTo = function(v) {
  if (audio.duration) audio.currentTime = (v/100) * audio.duration
}
window.setVolume = function(v) {
  audio.volume = v/100
}
window.setQuality = function(q) {
  document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('q-' + q.toLowerCase()).classList.add('active')
}
window.saveSetting = function(key, val) {
  console.log('Setting saved:', key, val)
}
window.openSettingsModal = function(type) {}
window.closeSettingsModal = function() {}

window.handleCoverSelect = function(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = function(ev) {
    document.getElementById('cover-preview-img').src = ev.target.result
    document.getElementById('cover-preview-img').classList.remove('hidden')
    document.getElementById('cover-placeholder').style.display = 'none'
  }
  reader.readAsDataURL(file)
}

window.handleFileSelect = function(e) {
  const file = e.target.files[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  document.getElementById('audio-preview').src = url
  document.getElementById('audio-preview-wrap').classList.remove('hidden')
  document.getElementById('drop-zone-text').textContent = '✅ ' + file.name
  document.getElementById('drop-zone').classList.add('file-selected')
}
window.editProfile = function() {
  const name = prompt('New display name:')
  if (name) document.getElementById('update-name').textContent = name
}

// ============================================
// CHECK EXISTING SESSION
// ============================================
async function checkSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      currentUser = session.user
      onAuthSuccess(session.user)
    }
  } catch (error) {
    console.error('Session check error:', error)
  }
}

checkSession()

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

console.log('🔥 Audivo Pro ready!')