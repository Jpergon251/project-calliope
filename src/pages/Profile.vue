<template>
  <main class="profile-page">
    <!-- ============================================================
         PORTADA DEL PERFIL
         ============================================================ -->

    <section class="profile-hero" :class="{ 'is-editing': isEditing }">
      <div class="profile-banner"></div>

      <div class="profile-hero-body">
        <div class="profile-avatar-wrap">
          <img
            v-if="user.avatarUrl"
            :src="user.avatarUrl"
            alt="Tu avatar"
            class="profile-avatar-img"
          />

          <span v-else class="profile-avatar-initials">
            {{ user.initials }}
          </span>

          <button
            type="button"
            class="avatar-edit-btn"
            title="Cambiar avatar"
            aria-label="Cambiar avatar"
            @click="openAvatarModal"
          >
            <Camera :size="14" />
          </button>
        </div>

        <div class="profile-hero-info">
          <template v-if="!isEditing">
            <h1 class="profile-name">
              {{
                user.profile.displayName ||
                user.profile.username ||
                (user.isGuest ? "Invitado" : "Oyente de Calliope")
              }}
            </h1>

            <p v-if="user.profile.username" class="profile-username">
              @{{ user.profile.username }}
            </p>

            <!-- INDICADOR DE TIPO DE PERFIL / SESIÓN -->
            <div v-if="user.isGuest" class="profile-status-badge is-guest">
              <User :size="13" />
              <span>Sesión temporal de invitado</span>
            </div>
            <div
              v-else-if="user.profile.private ?? user.profile.isPrivate"
              class="profile-status-badge is-private"
            >
              🔒 Perfil privado
            </div>
            <div v-else class="profile-status-badge is-local">
              Perfil público
            </div>

            <p v-if="user.profile.bio" class="profile-bio">
              {{ user.profile.bio }}
            </p>

            <p v-else class="profile-bio profile-bio-empty">
              {{
                user.isGuest
                  ? "Esta sesión es temporal. Los datos y cambios no se conservarán al cerrar sesión."
                  : "Añade una descripción para personalizar tu perfil."
              }}
            </p>
          </template>

          <form
            v-else
            class="profile-edit-form"
            @submit.prevent="saveIdentity"
          >
            <div class="form-row">
              <label class="form-field">
                <span>Nombre de usuario</span>
                <input
                  v-model="draft.username"
                  type="text"
                  placeholder="p.ej. alex_music"
                  maxlength="30"
                  autocomplete="username"
                />
              </label>

              <label class="form-field">
                <span>Nombre visible</span>
                <input
                  v-model="draft.displayName"
                  type="text"
                  placeholder="p.ej. Alejandro"
                  maxlength="40"
                />
              </label>
            </div>

            <label class="form-field">
              <span>URL del avatar</span>
              <input
                v-model="draft.avatarUrl"
                type="url"
                placeholder="https://ejemplo.com/avatar.jpg"
              />
            </label>

            <label class="form-field">
              <span>Descripción</span>
              <textarea
                v-model="draft.bio"
                rows="3"
                placeholder="Cuenta algo sobre tu gusto musical…"
                maxlength="240"
              ></textarea>
            </label>

            <div class="form-actions">
              <button type="submit" class="btn btn-primary">
                Guardar
              </button>

              <button
                type="button"
                class="btn btn-ghost"
                @click="cancelEditing"
              >
                Cancelar
              </button>
            </div>
          </form>

          <div v-if="!isEditing" class="profile-hero-actions">
            <button
              v-if="!user.isGuest"
              type="button"
              class="btn btn-primary"
              @click="startEditing"
            >
              <Pencil :size="14" />
              Editar perfil
            </button>

            <button
              type="button"
              class="btn btn-ghost"
              @click="handleLogout"
            >
              <LogOut :size="14" />
              Cerrar sesión
            </button>

            <span v-if="savedFlash" class="saved-flash">
              <Check :size="13" />
              Guardado
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================================
         NAVEGACIÓN DE CATEGORÍAS
         ============================================================ -->

    <nav class="profile-categories" aria-label="Secciones de perfil">
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="category-pill"
        :class="{ active: activeCategory === category.id }"
        @click="activeCategory = category.id"
      >
        <component :is="category.icon" :size="15" />
        <span>{{ category.label }}</span>
      </button>
    </nav>

    <!-- ============================================================
         ESTADÍSTICAS DEL USUARIO
         ============================================================ -->

    <section
      v-show="activeCategory === 'stats'"
      class="profile-section profile-stats-section"
    >
      <div class="stats-section-header">
        <div class="stats-title-wrap">
          <h2>
            <BarChart3 :size="18" />
            Tus estadísticas de escucha
          </h2>
          <p class="stats-subtitle">
            Métricas, hábitos y descubrimientos musicales registrados en este perfil.
          </p>
        </div>

        <!-- Period selector pills -->
        <div class="stats-period-selector" role="group" aria-label="Periodo de estadísticas">
          <button
            v-for="p in periodOptions"
            :key="p.id"
            type="button"
            class="period-pill"
            :class="{ active: selectedPeriod === p.id }"
            @click="selectedPeriod = p.id"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <!-- Hero KPI Metrics Grid -->
      <div class="stats-kpi-grid">
        <div class="kpi-card highlight-time">
          <div class="kpi-icon-wrap">
            <Clock :size="18" />
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Tiempo escuchado</span>
            <strong class="kpi-value">{{ currentStats.totalListenTimeFormatted }}</strong>
            <span class="kpi-subtext">{{ selectedPeriodLabel }}</span>
          </div>
        </div>

        <div class="kpi-card highlight-plays">
          <div class="kpi-icon-wrap">
            <Headphones :size="18" />
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Reproducciones</span>
            <strong class="kpi-value">{{ currentStats.totalPlays }}</strong>
            <span class="kpi-subtext">{{ currentStats.totalPlays === 1 ? 'canción reproducida' : 'reproducciones' }}</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap">
            <Music2 :size="18" />
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Canciones distintas</span>
            <strong class="kpi-value">{{ currentStats.uniqueSongsCount }}</strong>
            <span class="kpi-subtext">canciones únicas</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap">
            <UserRound :size="18" />
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Artistas distintos</span>
            <strong class="kpi-value">{{ currentStats.uniqueArtistsCount }}</strong>
            <span class="kpi-subtext">artistas explorados</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap">
            <DiscAlbum :size="18" />
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Álbumes distintos</span>
            <strong class="kpi-value">{{ currentStats.uniqueAlbumsCount }}</strong>
            <span class="kpi-subtext">álbumes escuchados</span>
          </div>
        </div>

        <div class="kpi-card highlight-likes">
          <div class="kpi-icon-wrap">
            <ThumbsUp :size="18" />
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Canciones con Like</span>
            <strong class="kpi-value">{{ currentStats.likedSongsCount }}</strong>
            <span class="kpi-subtext">favoritas en este perfil</span>
          </div>
        </div>
      </div>

      <!-- Spotlight Highlights -->
      <div v-if="currentStats.topSong || currentStats.topArtist || currentStats.topAlbum" class="stats-spotlight-row">
        <!-- Top Song Card -->
        <div v-if="currentStats.topSong" class="spotlight-card song-spotlight" @click="playSpotlightSong(currentStats.topSong)">
          <div class="spotlight-badge">
            <Flame :size="13" />
            <span>CANCIÓN MÁS ESCUCHADA</span>
          </div>
          <div class="spotlight-body">
            <div class="spotlight-cover">
              <img v-if="currentStats.topSong.cover" :src="currentStats.topSong.cover" :alt="currentStats.topSong.title" />
              <SongIconCover v-else class="spotlight-cover-fallback" />
              <div class="spotlight-play-overlay">
                <Play :size="18" fill="currentColor" />
              </div>
            </div>
            <div class="spotlight-details">
              <h4 class="spotlight-title" :title="currentStats.topSong.title">{{ currentStats.topSong.title }}</h4>
              <p class="spotlight-subtitle">{{ currentStats.topSong.artist }}</p>
              <div class="spotlight-metrics">
                <span><strong>{{ currentStats.topSong.plays }}</strong> {{ currentStats.topSong.plays === 1 ? 'reproducción' : 'reproducciones' }}</span>
                <span class="sep">•</span>
                <span>{{ currentStats.topSong.listenTimeFormatted }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Artist Card -->
        <div v-if="currentStats.topArtist" class="spotlight-card artist-spotlight" @click="goToArtist(currentStats.topArtist.name)">
          <div class="spotlight-badge">
            <Sparkles :size="13" />
            <span>ARTISTA MÁS ESCUCHADO</span>
          </div>
          <div class="spotlight-body">
            <div class="spotlight-avatar">
              <img
                v-if="currentStats.topArtist.cover"
                :src="currentStats.topArtist.cover"
                :alt="currentStats.topArtist.name"
              />
              <UserRound v-else :size="28" />
            </div>
            <div class="spotlight-details">
              <h4 class="spotlight-title">{{ currentStats.topArtist.name }}</h4>
              <p class="spotlight-subtitle">Artista destacado</p>
              <div class="spotlight-metrics">
                <span><strong>{{ currentStats.topArtist.plays }}</strong> reps.</span>
                <span class="sep">•</span>
                <span>{{ currentStats.topArtist.listenTimeFormatted }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Album Card -->
        <div v-if="currentStats.topAlbum" class="spotlight-card album-spotlight" @click="goToAlbum(currentStats.topAlbum.id)">
          <div class="spotlight-badge">
            <DiscAlbum :size="13" />
            <span>ÁLBUM MÁS ESCUCHADO</span>
          </div>
          <div class="spotlight-body">
            <div class="spotlight-cover">
              <img v-if="currentStats.topAlbum.cover" :src="currentStats.topAlbum.cover" :alt="currentStats.topAlbum.name" />
              <DiscAlbum v-else :size="28" class="spotlight-cover-fallback" />
            </div>
            <div class="spotlight-details">
              <h4 class="spotlight-title" :title="currentStats.topAlbum.name">{{ currentStats.topAlbum.name }}</h4>
              <p class="spotlight-subtitle">{{ currentStats.topAlbum.artist || 'Varios artistas' }}</p>
              <div class="spotlight-metrics">
                <span><strong>{{ currentStats.topAlbum.plays }}</strong> reps.</span>
                <span class="sep">•</span>
                <span>{{ currentStats.topAlbum.listenTimeFormatted }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Activity Bar Chart -->
      <div class="stats-chart-card">
        <div class="chart-header">
          <div class="chart-title-wrap">
            <h3>Actividad de escucha</h3>
            <p>Distribución de tiempo reproducido en este periodo</p>
          </div>
          <div class="chart-legend">
            <span class="legend-dot"></span>
            <span>Minutos escuchados</span>
          </div>
        </div>

        <div class="activity-bars-container" :class="`period-${selectedPeriod}`">
          <div
            v-for="(bucket, bIdx) in currentStats.chartData"
            :key="bIdx"
            class="activity-bar-col"
            :class="{ 'is-current': bucket.isCurrent }"
          >
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ height: `${getBarHeightPercent(bucket.minutes)}%` }"
                :title="`${bucket.label}: ${bucket.minutes} min (${bucket.plays} rep.)`"
              ></div>
            </div>
            <span class="bar-label">{{ bucket.label }}</span>
            <span class="bar-val">{{ bucket.minutes > 0 ? `${bucket.minutes}m` : '' }}</span>
            <span v-if="bucket.isCurrent" class="current-indicator-dot" title="Momento actual"></span>
          </div>
        </div>
      </div>

      <!-- Rankings Layout (Top Canciones, Top Artistas, Top Álbumes) -->
      <div class="stats-rankings-layout">
        <!-- Top Canciones -->
        <div class="ranking-panel">
          <div class="ranking-header">
            <h4>
              <Flame :size="15" />
              Top Canciones
            </h4>
            <span class="ranking-count" v-if="currentStats.topSongs.length">{{ currentStats.topSongs.length }} canciones</span>
          </div>

          <div v-if="currentStats.topSongs.length" class="ranking-list">
            <div
              v-for="s in currentStats.topSongs"
              :key="s.id"
              class="ranking-item"
              @click="playRankingSong(s.id)"
            >
              <span class="rank-badge" :class="`rank-${s.rank}`">{{ s.rank }}</span>
              <div class="ranking-cover">
                <img v-if="s.cover" :src="s.cover" :alt="s.title" />
                <SongIconCover v-else class="cover-icon" />
                <div class="play-overlay"><Play :size="12" fill="currentColor" /></div>
              </div>
              <div class="ranking-meta">
                <span class="ranking-name" :title="s.title">{{ s.title }}</span>
                <span class="ranking-sub" @click.stop="goToArtist(s.artist)">{{ s.artist }}</span>
              </div>
              <div class="ranking-stats">
                <span class="rank-plays">{{ s.plays }} {{ s.plays === 1 ? 'rep.' : 'reps.' }}</span>
                <span class="rank-duration">{{ s.listenTimeFormatted }}</span>
              </div>
            </div>
          </div>
          <p v-else class="ranking-empty">No hay reproducciones registradas en este periodo.</p>
        </div>

        <!-- Top Artistas -->
        <div class="ranking-panel">
          <div class="ranking-header">
            <h4>
              <UserRound :size="15" />
              Top Artistas
            </h4>
            <span class="ranking-count" v-if="currentStats.topArtists.length">{{ currentStats.topArtists.length }} artistas</span>
          </div>

          <div v-if="currentStats.topArtists.length" class="ranking-list">
            <div
              v-for="a in currentStats.topArtists"
              :key="a.name"
              class="ranking-item clickable-row"
              @click="goToArtist(a.name)"
            >
              <span class="rank-badge" :class="`rank-${a.rank}`">{{ a.rank }}</span>
              <div class="ranking-avatar">
                <img
                  v-if="a.cover"
                  :src="a.cover"
                  :alt="a.name"
                />
                <UserRound v-else :size="16" />
              </div>
              <div class="ranking-meta">
                <span class="ranking-name">{{ a.name }}</span>
                <span class="ranking-sub">Artista</span>
              </div>
              <div class="ranking-stats">
                <span class="rank-plays">{{ a.plays }} reps.</span>
                <span class="rank-duration">{{ a.listenTimeFormatted }}</span>
              </div>
            </div>
          </div>
          <p v-else class="ranking-empty">No hay artistas registrados en este periodo.</p>
        </div>

        <!-- Top Álbumes -->
        <div class="ranking-panel">
          <div class="ranking-header">
            <h4>
              <DiscAlbum :size="15" />
              Top Álbumes
            </h4>
            <span class="ranking-count" v-if="currentStats.topAlbums.length">{{ currentStats.topAlbums.length }} álbumes</span>
          </div>

          <div v-if="currentStats.topAlbums.length" class="ranking-list">
            <div
              v-for="alb in currentStats.topAlbums"
              :key="alb.id || alb.name"
              class="ranking-item clickable-row"
              @click="goToAlbum(alb.id)"
            >
              <span class="rank-badge" :class="`rank-${alb.rank}`">{{ alb.rank }}</span>
              <div class="ranking-cover">
                <img v-if="alb.cover" :src="alb.cover" :alt="alb.name" />
                <DiscAlbum v-else :size="16" class="cover-icon" />
              </div>
              <div class="ranking-meta">
                <span class="ranking-name" :title="alb.name">{{ alb.name }}</span>
                <span class="ranking-sub">{{ alb.artist || 'Varios artistas' }}</span>
              </div>
              <div class="ranking-stats">
                <span class="rank-plays">{{ alb.plays }} reps.</span>
                <span class="rank-duration">{{ alb.listenTimeFormatted }}</span>
              </div>
            </div>
          </div>
          <p v-else class="ranking-empty">No hay álbumes registrados en este periodo.</p>
        </div>
      </div>

      <!-- Recent Playback Activity -->
      <div v-if="currentStats.recentActivity.length" class="recent-activity-panel">
        <div class="panel-header">
          <h3>
            <Clock :size="16" />
            Actividad de escucha reciente
          </h3>
          <router-link to="/history" class="see-all-history-link">
            Ver historial completo
          </router-link>
        </div>

        <div class="recent-activity-list">
          <div
            v-for="act in currentStats.recentActivity"
            :key="act.id"
            class="activity-row"
            @click="playRankingSong(act.songId)"
          >
            <div class="activity-cover">
              <img v-if="act.cover" :src="act.cover" :alt="act.title" />
              <SongIconCover v-else class="cover-icon" />
              <div class="play-overlay"><Play :size="11" fill="currentColor" /></div>
            </div>
            <div class="activity-info">
              <span class="act-title">{{ act.title }}</span>
              <span class="act-artist" @click.stop="goToArtist(act.artist)">{{ act.artist }}</span>
            </div>
            <span class="act-time-listened">{{ act.listenTimeFormatted }}</span>
            <span class="act-timestamp">{{ formatRelativeTime(act.timestamp) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================================
         APARIENCIA
         ============================================================ -->

    <section
      v-show="activeCategory === 'appearance'"
      class="profile-section"
    >
      <h2>
        <Palette :size="17" />
        Apariencia
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Color de acento</strong>
            <p>
              Elige el tono neón que tiñe botones, progreso y detalles.
            </p>
          </div>

          <div class="accent-swatches">
            <button
              v-for="opt in ACCENT_OPTIONS"
              :key="opt.value"
              type="button"
              class="accent-swatch"
              :class="{
                selected: user.profile.accentColor === opt.value,
              }"
              :style="{ '--swatch': opt.color }"
              :aria-label="opt.label"
              :title="opt.label"
              @click="user.updateProfile({ accentColor: opt.value })"
            >
              <Check
                v-if="user.profile.accentColor === opt.value"
                :size="13"
              />
            </button>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Menos animaciones</strong>
            <p>
              Reduce movimientos y transiciones en toda la aplicación.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.reducedMotion"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Visualizador de audio</strong>
            <p>
              Muestra el visualizador durante la reproducción.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.showVisualizer"
            @update:modelValue="user.save()"
          />
        </div>
      </div>
    </section>

    <!-- ============================================================
         REPRODUCCIÓN
         ============================================================ -->

    <section
      v-show="activeCategory === 'playback'"
      class="profile-section"
    >
      <h2>
        <Play :size="17" />
        Reproducción
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Recordar cola y canción</strong>
            <p>
              Al volver a abrir Calliope se recupera la última cola de
              reproducción.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.keepQueueWhenClosing"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Intentar reanudar al abrir</strong>
            <p>
              Si el navegador lo permite, continúa la reproducción
              automáticamente.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.autoplayOnStart"
            @update:modelValue="user.save()"
          />
        </div>
      </div>
    </section>

    <!-- ============================================================
         BIBLIOTECA
         ============================================================ -->

    <section
      v-show="activeCategory === 'library'"
      class="profile-section"
    >
      <h2>
        <LibraryIcon :size="17" />
        Biblioteca e Inicio
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Orden de la biblioteca</strong>
            <p>
              Cómo se ordenan tus canciones por defecto.
            </p>
          </div>

          <select
            v-model="user.profile.librarySortMode"
            class="pref-select"
            @change="user.save()"
          >
            <option value="name">Título</option>
            <option value="artist">Artista</option>
            <option value="duration">Duración</option>
          </select>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Mostrar "Vuelve a escucharlo"</strong>
            <p>
              Sección de contenido reciente en Inicio.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.homeShowHistory"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Mostrar álbumes más escuchados</strong>
            <p>
              Ranking según tu actividad real de escucha.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.homeShowTopAlbums"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Mostrar playlists más escuchadas</strong>
            <p>
              Tus listas favoritas según el historial.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.homeShowTopPlaylists"
            @update:modelValue="user.save()"
          />
        </div>
      </div>

      <!-- Biblioteca de música -->

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Biblioteca de música</strong>
            <p>
              Administra la carpeta donde Calliope busca tus canciones.
            </p>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Canciones cargadas</strong>
          </div>

          <span class="local-badge">
            {{ library.songs.length }}
          </span>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Cambiar carpeta de música</strong>
            <p>
              Selecciona una nueva carpeta donde se encuentran tus
              archivos de música.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-primary"
            @click="library.selectFolder()"
          >
            Cambiar carpeta
          </button>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Eliminar carpeta de música</strong>
            <p>
              Desvincula la carpeta actual. Tus archivos originales
              no serán eliminados.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-danger"
            :disabled="!library.folderHandle"
            @click="removeLibrary"
          >
            Eliminar carpeta
          </button>
        </div>
      </div>
    </section>

    <!-- ============================================================
         AJUSTES
         ============================================================ -->

    <section
      v-show="activeCategory === 'settings'"
      class="profile-section"
    >
      <h2>
        <SettingsIcon :size="17" />
        Ajustes
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Biblioteca de Música</strong>
            <p>
              Administra la carpeta donde Calliope busca tus canciones.
            </p>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Canciones cargadas</strong>
          </div>

          <span class="local-badge">
            {{ library.songs.length }}
          </span>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Cambiar carpeta de música</strong>
            <p>
              Selecciona una nueva carpeta donde se encuentran tus
              archivos de música.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-primary"
            @click="library.selectFolder()"
          >
            Cambiar carpeta
          </button>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Eliminar carpeta de música</strong>
            <p>
              Desvincula la carpeta actual. Tus archivos originales
              no serán eliminados.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-danger"
            :disabled="!library.folderHandle"
            @click="removeLibrary"
          >
            Eliminar carpeta
          </button>
        </div>
      </div>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Estado de la Biblioteca</strong>
            <p>
              Comprueba y mantiene organizada la información de tus
              canciones.
            </p>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Canciones sin metadatos</strong>
          </div>

          <span class="local-badge">
            {{ songsWithoutMetadata }}
          </span>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Gestionar metadatos</strong>
            <p>
              Consulta, edita y analiza los metadatos de tus canciones.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-primary"
            :disabled="!library.folderHandle"
            @click="router.push('/metadata')"
          >
            Metadatos
          </button>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Escanear de nuevo</strong>
            <p>
              Busca nuevos archivos añadidos a la carpeta seleccionada.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-primary"
            :disabled="!library.folderHandle"
            @click="library.rescanLibrary()"
          >
            Escanear
          </button>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Reconstruir biblioteca</strong>
            <p>
              Elimina la información guardada y vuelve a analizar
              todos los archivos.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost"
            :disabled="!library.folderHandle"
            @click="rebuild"
          >
            Reconstruir
          </button>
        </div>
      </div>
    </section>

    <!-- ============================================================
         PRIVACIDAD Y DATOS
         ============================================================ -->

    <section
      v-show="activeCategory === 'privacy'"
      class="profile-section"
    >
      <h2>
        <ShieldCheck :size="17" />
        Privacidad y datos
      </h2>

      <div class="pref-card">
        <div v-if="!user.isGuest" class="pref-row">
          <div class="pref-text">
            <strong>Perfil privado</strong>
            <p>
              {{
                Boolean(user.profile.private ?? user.profile.isPrivate)
                  ? "Este perfil está protegido con contraseña en este dispositivo."
                  : "Este perfil es público en este dispositivo. No requiere contraseña para entrar."
              }}
            </p>
          </div>

          <ToggleSwitch
            :model-value="Boolean(user.profile.private ?? user.profile.isPrivate)"
            @update:model-value="handleTogglePrivacy"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Guardar historial de escucha</strong>
            <p>
              Registra lo que reproduces para potenciar las secciones
              de Inicio.
            </p>
          </div>

          <ToggleSwitch
            v-model="user.profile.saveListeningHistory"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Almacenamiento local</strong>

            <p v-if="storageText">
              {{ storageText }}
            </p>

            <p v-else>
              Calliope es 100% local: nada sale de este dispositivo.
            </p>
          </div>

          <span class="local-badge">
            <HardDrive :size="14" />
            Local
          </span>
        </div>
      </div>

      <div class="pref-card danger-zone">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Restablecer preferencias</strong>
            <p>
              Vuelve a los valores originales de apariencia,
              reproducción y biblioteca.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost"
            @click="resetPreferences"
          >
            Restablecer
          </button>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Cerrar sesión</strong>
            <p>
              {{
                user.isGuest
                  ? "Finaliza la sesión de invitado. Los datos temporales se borrarán."
                  : "Cierra la sesión activa y vuelve a la selección de perfil."
              }}
            </p>
          </div>

          <button
            type="button"
            class="btn btn-ghost"
            @click="handleLogout"
          >
            <LogOut :size="14" />
            Cerrar sesión
          </button>
        </div>

        <div v-if="!user.isGuest" class="pref-row">
          <div class="pref-text">
            <strong>Eliminar perfil</strong>
            <p>
              Borra este perfil local, identidad y preferencias de este dispositivo.
            </p>
          </div>

          <button
            type="button"
            class="btn btn-danger"
            @click="wipeProfile"
          >
            Eliminar perfil
          </button>
        </div>
      </div>
    </section>

    <!-- ============================================================
         MODAL CAMBIAR AVATAR
         ============================================================ -->

    <div
      v-if="isAvatarModalOpen"
      class="modal-backdrop"
      @click.self="isAvatarModalOpen = false"
    >
      <div class="modal-card avatar-dialog-card">
        <div class="modal-header-simple">
          <h3>Cambiar imagen de perfil</h3>

          <button
            type="button"
            class="close-btn"
            aria-label="Cerrar"
            @click="isAvatarModalOpen = false"
          >
            <X :size="16" />
          </button>
        </div>

        <p class="dialog-desc">
          Introduce una URL de imagen o selecciona un archivo local.
        </p>

        <label class="form-field">
          <span>URL de la imagen</span>

          <input
            v-model="avatarUrlDraft"
            type="url"
            placeholder="https://ejemplo.com/avatar.jpg"
            @keyup.enter="saveAvatarUrl"
          />
        </label>

        <div v-if="avatarUrlDraft" class="dialog-preview-wrap">
          <img
            :src="avatarUrlDraft"
            alt="Vista previa"
            class="dialog-preview-img"
          />
        </div>

        <div class="dialog-actions-row">
          <label
            class="btn btn-ghost file-picker-label"
            title="Seleccionar archivo del dispositivo"
          >
            <Camera :size="14" />
            <span>Subir archivo</span>

            <input
              type="file"
              accept="image/*"
              hidden
              @change="pickAvatarFile"
            />
          </label>

          <div class="action-buttons-group">
            <button
              v-if="user.avatarUrl"
              type="button"
              class="btn btn-danger"
              @click="removeAvatar"
            >
              Eliminar
            </button>

            <button
              type="button"
              class="btn btn-primary"
              @click="saveAvatarUrl"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================
         MODAL ESTABLECER CONTRASEÑA DE PERFIL PRIVADO
         ============================================================ -->

    <div
      v-if="isSetPasswordModalOpen"
      class="modal-backdrop"
      @click.self="cancelSetPassword"
    >
      <div class="modal-card password-dialog-card">
        <div class="modal-header-simple">
          <h3>Proteger perfil con contraseña</h3>

          <button
            type="button"
            class="close-btn"
            aria-label="Cerrar"
            @click="cancelSetPassword"
          >
            <X :size="16" />
          </button>
        </div>

        <p class="dialog-desc">
          Para hacer privado este perfil, establece una contraseña. Se te pedirá cada vez que inicies sesión en este dispositivo.
        </p>

        <form @submit.prevent="confirmSetPassword">
          <label class="form-field">
            <span>Nueva contraseña</span>
            <input
              v-model="passwordDraft.password"
              type="password"
              autocomplete="new-password"
              placeholder="Mínimo 4 caracteres"
              required
              autofocus
            />
          </label>

          <label class="form-field">
            <span>Confirmar contraseña</span>
            <input
              v-model="passwordDraft.confirmPassword"
              type="password"
              autocomplete="new-password"
              placeholder="Repite la contraseña"
              required
            />
          </label>

          <p v-if="passwordError" class="dialog-error-msg">
            <AlertCircle :size="14" />
            {{ passwordError }}
          </p>

          <div class="dialog-actions-row">
            <button
              type="button"
              class="btn btn-ghost"
              @click="cancelSetPassword"
            >
              Cancelar
            </button>

            <button
              type="submit"
              class="btn btn-primary"
              :disabled="isSettingPassword"
            >
              <span v-if="isSettingPassword">Guardando...</span>
              <span v-else>Establecer y activar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import {
  AlertCircle,
  BarChart3,
  Camera,
  Check,
  Clock,
  DiscAlbum,
  Flame,
  HardDrive,
  Headphones,
  LibraryIcon,
  Lock,
  LogOut,
  Music2,
  Palette,
  Pencil,
  Play,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  User,
  UserRound,
  X,
} from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore.js";
import { useLibraryStore } from "../stores/libraryStore.js";
import { downscaleImage } from "../lib/covers.js";
import ToggleSwitch from "../components/common/ToggleSwitch.vue";
import SongIconCover from "../components/common/SongIconCover.vue";

const user = useUserStore();
const library = useLibraryStore();
const router = useRouter();

const ACCENT_OPTIONS = [
  { value: "neon", label: "Neón", color: "#25d866" },
  { value: "cyan", label: "Cian", color: "#22d3ee" },
  { value: "magenta", label: "Magenta", color: "#e14eca" },
  { value: "amber", label: "Ámbar", color: "#fbbf24" },
];

const categories = [
  { id: "stats", label: "Estadísticas", icon: BarChart3 },
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "playback", label: "Reproducción", icon: Play },
  { id: "library", label: "Biblioteca", icon: LibraryIcon },
  { id: "settings", label: "Ajustes", icon: SettingsIcon },
  { id: "privacy", label: "Privacidad", icon: ShieldCheck },
];

const activeCategory = ref("stats");

// ============================================================
// ESTADÍSTICAS DEL PERFIL
// ============================================================

const periodOptions = [
  { id: "day", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "all", label: "Año" },
];

const selectedPeriod = ref("all");

const selectedPeriodLabel = computed(() => {
  switch (selectedPeriod.value) {
    case "day":
      return "en las últimas 24h";
    case "week":
      return "en los últimos 7 días";
    case "month":
      return "en los últimos 30 días";
    default:
      return "en el año actual";
  }
});

const currentStats = computed(() => {
  return library.getProfileStats(selectedPeriod.value);
});

function getBarHeightPercent(minutes) {
  const chartData = currentStats.value?.chartData || [];
  const maxMin = Math.max(1, ...chartData.map((b) => b.minutes || 0));
  if (!minutes || minutes <= 0) return 4;
  return Math.min(100, Math.max(10, Math.round((minutes / maxMin) * 100)));
}
/* ============================================================
   TOOLTIP DE ACTIVIDAD DE ESCUCHA
   ============================================================ */
const hoveredBucket = ref(null);
function showBucketTooltip(bucket) {
  hoveredBucket.value = bucket;
}
function hideBucketTooltip() {
  hoveredBucket.value = null;
}
function tooltipPercentOfTotal(bucket) {
  const total = currentStats.value?.totalListenTime || 0;
  const bucketSec = (bucket?.minutes || 0) * 60;
  if (!total || !bucketSec) return "0";
  return ((bucketSec / total) * 100).toFixed(1).replace(/\.?0+$/, "");
}
// Etiqueta contextual completa para el tooltip (p. ej. "Viernes 14 de febrero",
// "14:00 - 15:00", "Febrero"). Según el periodo seleccionado.
function bucketFullLabel(bucket) {
  if (!bucket) return "";
  const p = selectedPeriod.value;
  if (p === "day") {
    const h = (bucket.hour ?? 0);
    const next = (h + 1) % 24;
    return `${String(h).padStart(2, "0")}:00 – ${String(next).padStart(2, "0")}:00`;
  }
  if (p === "month") {
    const d = bucket.dayNumber;
    if (d) {
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth(), d);
      return date.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }
  }
  if (p === "all") {
    const monthNamesFull = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    if (bucket.monthIndex != null) {
      return `${monthNamesFull[bucket.monthIndex]} ${bucket.year || ""}`.trim();
    }
  }
  // week o fallback
  const dayNamesFull = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  if (bucket.label === "Hoy") return "Hoy";
  return bucket.label || "";
}


function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "hace unos segundos";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "ayer";
  if (diffDays < 30) return `hace ${diffDays} días`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function playSpotlightSong(topSong) {
  if (!topSong?.id) return;
  const found = library.songs.find((s) => s.id === topSong.id);
  if (found) {
    library.playSong(found);
    if (typeof window !== "undefined" && window.innerWidth <= 760) {
      library.openNowPlaying();
    }
  }
}

function playRankingSong(songId) {
  if (!songId) return;
  const found = library.songs.find((s) => s.id === songId);
  if (found) {
    library.playSong(found);
    if (typeof window !== "undefined" && window.innerWidth <= 760) {
      library.openNowPlaying();
    }
  }
}

function goToArtist(name) {
  if (!name || name === "Unknown" || name === "Artista desconocido") return;
  router.push({
    name: "artist",
    params: { name: encodeURIComponent(name.trim()) },
  });
}

function goToAlbum(albumId) {
  if (!albumId) return;
  router.push({ name: "album", params: { id: albumId } });
}
const isEditing = ref(false);
const savedFlash = ref(false);
const storageText = ref("");
const isAvatarModalOpen = ref(false);
const isSetPasswordModalOpen = ref(false);
const isSettingPassword = ref(false);
const passwordError = ref("");
const passwordDraft = reactive({
  password: "",
  confirmPassword: "",
});
const avatarUrlDraft = ref("");

const draft = reactive({
  username: "",
  displayName: "",
  bio: "",
  avatarUrl: "",
});

const songsWithoutMetadata = computed(
  () => library.songs.filter((song) => !song.hasMetadata).length,
);

function flashSaved() {
  savedFlash.value = true;

  setTimeout(() => {
    savedFlash.value = false;
  }, 1800);
}

function startEditing() {
  draft.username = user.profile.username;
  draft.displayName = user.profile.displayName;
  draft.bio = user.profile.bio;
  draft.avatarUrl = user.profile.avatarUrl || "";

  isEditing.value = true;
}

function cancelEditing() {
  isEditing.value = false;
}

async function saveIdentity() {
  const avatarUrl = draft.avatarUrl.trim();

  await user.updateProfile({
    username: draft.username.trim(),
    displayName: draft.displayName.trim(),
    bio: draft.bio.trim(),
    avatarUrl,
  });

  if (avatarUrl) {
    await user.setAvatar(avatarUrl);
  }

  isEditing.value = false;
  flashSaved();
}

async function removeLibrary() {
  const confirmed = confirm(
    "¿Quieres eliminar la carpeta de música seleccionada?\n\n" +
      "Tus archivos originales no serán borrados.",
  );

  if (!confirmed) return;

  await library.removeFolder();
}

async function rebuild() {
  const confirmed = confirm(
    "Se reconstruirá la biblioteca desde cero.\n\n" +
      "Las playlists y configuraciones no se eliminarán.\n\n" +
      "¿Continuar?",
  );

  if (!confirmed) return;

  await library.rebuildLibrary();
}

function openAvatarModal() {
  avatarUrlDraft.value = user.profile.avatarUrl || "";
  isAvatarModalOpen.value = true;
}

async function saveAvatarUrl() {
  const url = avatarUrlDraft.value.trim();

  if (url) {
    await user.setAvatar(url);
  }

  isAvatarModalOpen.value = false;
  flashSaved();
}

async function removeAvatar() {
  await user.setAvatar(null);

  avatarUrlDraft.value = "";
  isAvatarModalOpen.value = false;

  flashSaved();
}

async function pickAvatarFile(event) {
  const file = event.target.files?.[0];

  if (!file || !file.type.startsWith("image/")) {
    event.target.value = "";
    return;
  }

  try {
    const blob = await downscaleImage(file, 360);

    await user.setAvatar(blob);

    isAvatarModalOpen.value = false;
    flashSaved();
  } catch (error) {
    console.error("Error al actualizar avatar:", error);
  } finally {
    event.target.value = "";
  }
}

async function resetPreferences() {
  const confirmed = confirm(
    "¿Restablecer todas las preferencias?\n\n" +
      "Tu identidad e imágenes se conservan.",
  );

  if (!confirmed) return;

  await user.resetPreferences();
  flashSaved();
}

async function handleLogout() {
  await user.logout();
  router.push("/welcome");
}

async function handleTogglePrivacy(newValue) {
  if (user.isGuest) return;

  if (!newValue) {
    await user.setProfilePrivacy(false);
    flashSaved();
    return;
  }

  if (user.hasPassword) {
    await user.setProfilePrivacy(true);
    flashSaved();
  } else {
    passwordDraft.password = "";
    passwordDraft.confirmPassword = "";
    passwordError.value = "";
    isSetPasswordModalOpen.value = true;
  }
}

async function confirmSetPassword() {
  passwordError.value = "";
  if (!passwordDraft.password || passwordDraft.password.length < 4) {
    passwordError.value = "La contraseña debe tener al menos 4 caracteres.";
    return;
  }
  if (passwordDraft.password !== passwordDraft.confirmPassword) {
    passwordError.value = "Las contraseñas no coinciden.";
    return;
  }

  isSettingPassword.value = true;
  try {
    const res = await user.setProfilePrivacy(true, passwordDraft.password);
    if (res.success) {
      isSetPasswordModalOpen.value = false;
      flashSaved();
    } else {
      passwordError.value = res.error || "Error al establecer la contraseña.";
    }
  } catch (err) {
    passwordError.value = "Error al guardar la contraseña.";
  } finally {
    isSettingPassword.value = false;
  }
}

function cancelSetPassword() {
  isSetPasswordModalOpen.value = false;
  passwordError.value = "";
}

async function wipeProfile() {
  const confirmed = confirm(
    "Se eliminará este perfil completo (identidad, imágenes y preferencias) de este dispositivo." +
      "\n\n¿Continuar?",
  );

  if (!confirmed) return;

  await user.wipeProfile();
  router.push("/welcome");
}

onMounted(async () => {
  await user.load();

  try {
    const estimate = await navigator.storage?.estimate?.();

    if (estimate?.usage != null) {
      storageText.value =
        `Calliope usa ${(estimate.usage / 1024 / 1024).toFixed(1)} MB ` +
        "de tu dispositivo. Nada se envía a ningún servidor.";
    }
  } catch {
    // La estimación de almacenamiento es opcional.
  }
});
</script>