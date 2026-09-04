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

          <form v-else class="profile-edit-form" @submit.prevent="saveIdentity">
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
              <button type="submit" class="btn btn-primary">Guardar</button>

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

            <button type="button" class="btn btn-ghost" @click="handleLogout">
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
            Métricas, hábitos y descubrimientos musicales registrados en este
            perfil.
          </p>
        </div>

        <!-- Period selector pills -->
        <div
          class="stats-period-selector"
          role="group"
          aria-label="Periodo de estadísticas"
        >
          <button
            v-for="p in periodOptions"
            :key="p.id"
            type="button"
            class="period-pill"
            :class="{ active: selectedPeriod === p.id }"
            @click="selectPeriod(p.id)"
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
            <strong class="kpi-value">{{
              currentStats.totalListenTimeFormatted
            }}</strong>
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
            <span class="kpi-subtext">{{
              currentStats.totalPlays === 1
                ? "canción reproducida"
                : "reproducciones"
            }}</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap">
            <Music2 :size="18" />
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Canciones distintas</span>
            <strong class="kpi-value">{{
              currentStats.uniqueSongsCount
            }}</strong>
            <span class="kpi-subtext">canciones únicas</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap">
            <UserRound :size="18" />
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Artistas distintos</span>
            <strong class="kpi-value">{{
              currentStats.uniqueArtistsCount
            }}</strong>
            <span class="kpi-subtext">artistas explorados</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap">
            <DiscAlbum :size="18" />
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Álbumes distintos</span>
            <strong class="kpi-value">{{
              currentStats.uniqueAlbumsCount
            }}</strong>
            <span class="kpi-subtext">álbumes escuchados</span>
          </div>
        </div>

        <div class="kpi-card highlight-likes">
          <div class="kpi-icon-wrap">
            <ThumbsUp :size="18" />
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Canciones con Like</span>
            <strong class="kpi-value">{{
              currentStats.likedSongsCount
            }}</strong>
            <span class="kpi-subtext">favoritas en este perfil</span>
          </div>
        </div>
      </div>

      <!-- Spotlight Highlights -->
      <div
        v-if="
          currentStats.topSong ||
          currentStats.topArtist ||
          currentStats.topAlbum
        "
        class="stats-spotlight-row"
      >
        <!-- Top Song Card -->
        <div
          v-if="currentStats.topSong"
          class="spotlight-card song-spotlight"
          @click="playSpotlightSong(currentStats.topSong)"
        >
          <div class="spotlight-badge">
            <Flame :size="13" />
            <span>CANCIÓN MÁS ESCUCHADA</span>
          </div>
          <div class="spotlight-body">
            <div class="spotlight-cover">
              <img
                v-if="currentStats.topSong.cover"
                :src="currentStats.topSong.cover"
                :alt="currentStats.topSong.title"
              />
              <SongIconCover v-else class="spotlight-cover-fallback" />
              <div class="spotlight-play-overlay">
                <Play :size="18" fill="currentColor" />
              </div>
            </div>
            <div class="spotlight-details">
              <h4 class="spotlight-title" :title="currentStats.topSong.title">
                {{ currentStats.topSong.title }}
              </h4>
              <p class="spotlight-subtitle">
                {{ currentStats.topSong.artist }}
              </p>
              <div class="spotlight-metrics">
                <span
                  ><strong>{{ currentStats.topSong.plays }}</strong>
                  {{
                    currentStats.topSong.plays === 1
                      ? "reproducción"
                      : "reproducciones"
                  }}</span
                >
                <span class="sep">•</span>
                <span>{{ currentStats.topSong.listenTimeFormatted }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Artist Card -->
        <div
          v-if="currentStats.topArtist"
          class="spotlight-card artist-spotlight"
          @click="goToArtist(currentStats.topArtist.name)"
        >
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
                <span
                  ><strong>{{ currentStats.topArtist.plays }}</strong>
                  reps.</span
                >
                <span class="sep">•</span>
                <span>{{ currentStats.topArtist.listenTimeFormatted }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Album Card -->
        <div
          v-if="currentStats.topAlbum"
          class="spotlight-card album-spotlight"
          @click="goToAlbum(currentStats.topAlbum.id)"
        >
          <div class="spotlight-badge">
            <DiscAlbum :size="13" />
            <span>ÁLBUM MÁS ESCUCHADO</span>
          </div>
          <div class="spotlight-body">
            <div class="spotlight-cover">
              <img
                v-if="currentStats.topAlbum.cover"
                :src="currentStats.topAlbum.cover"
                :alt="currentStats.topAlbum.name"
              />
              <DiscAlbum v-else :size="28" class="spotlight-cover-fallback" />
            </div>
            <div class="spotlight-details">
              <h4 class="spotlight-title" :title="currentStats.topAlbum.name">
                {{ currentStats.topAlbum.name }}
              </h4>
              <p class="spotlight-subtitle">
                {{ currentStats.topAlbum.artist || "Varios artistas" }}
              </p>
              <div class="spotlight-metrics">
                <span
                  ><strong>{{ currentStats.topAlbum.plays }}</strong>
                  reps.</span
                >
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
            <p>Distribución de la métrica seleccionada en este periodo</p>
          </div>
          <div class="chart-legend">
            <span class="legend-dot"></span>
            <span>{{ selectedMetricLabel }}</span>
          </div>
        </div>
        <div class="chart-controls">
          <div
            class="metric-selector"
            role="group"
            aria-label="Métrica del gráfico"
          >
            <button
              v-for="m in metricOptions"
              :key="m.id"
              type="button"
              class="metric-pill"
              :class="{ active: selectedMetric === m.id }"
              @click="selectedMetric = m.id"
            >
              {{ m.label }}
            </button>
          </div>
        </div>
        <div class="period-nav">
          <button
            type="button"
            class="period-nav-btn"
            aria-label="Periodo anterior"
            title="Periodo anterior"
            @click="goPrevPeriod"
          >
            <ChevronLeft :size="16" />
          </button>
          <div class="period-nav-title">
            <span class="period-nav-label">
              {{ isCurrentPeriod ? "Actual" : "Periodo anterior" }}
            </span>
            <strong>{{ periodTitle }}</strong>
            <button
              v-if="!isCurrentPeriod"
              type="button"
              class="period-now-btn"
              @click="goToCurrentPeriod"
            >
              Volver al actual
            </button>
          </div>
          <button
            type="button"
            class="period-nav-btn"
            aria-label="Periodo siguiente"
            title="Periodo siguiente"
            :disabled="!canGoNext"
            @click="goNextPeriod"
          >
            <ChevronRight :size="16" />
          </button>
        </div>
        <div class="compare-row">
          <button
            type="button"
            class="compare-toggle"
            :class="{ active: compareEnabled }"
            @click="compareEnabled = !compareEnabled"
          >
            <TrendingUp v-if="!compareEnabled" :size="14" />
            <TrendingDown v-else :size="14" />
            Comparar con el periodo anterior
          </button>
          <div
            v-if="compareDelta"
            class="compare-delta"
            :class="compareDelta.positive ? 'is-positive' : 'is-negative'"
          >
            <span
              >{{ compareDelta.positive ? "+" : "-"
              }}{{ compareDelta.diffTimeFormatted }}</span
            >
            <span class="sep">·</span>
            <span
              >{{ compareDelta.positive ? "+" : "-"
              }}{{ compareDelta.pct }}%</span
            >
          </div>
        </div>
        <div class="activity-chart-wrap">
          <div
            class="activity-bars-container"
            :class="`period-${selectedPeriod}`"
          >
            <div
              v-for="(bucket, bIdx) in chartBuckets"
              :key="bIdx"
              class="activity-bar-col"
              :class="{ 'is-current': bucket.isCurrent }"
              @mouseenter="setHoveredBucket({ bucket, index: bIdx })"
              @mouseleave="clearHoveredBucket"
              @click="toggleHoveredBucket({ bucket, index: bIdx })"
            >
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :style="{ height: `${getBarHeightPercent(bucket)}%` }"
                ></div>
              </div>
              <span class="bar-label">{{ bucket.label }}</span>
              <span class="bar-val">{{ formatBarValue(bucket) }}</span>
              <span
                v-if="bucket.isCurrent"
                class="current-indicator-dot"
                title="Momento actual"
              ></span>
            </div>
          </div>
          <div v-if="hoveredBucket" class="chart-tooltip" :style="tooltipStyle">
            <div class="chart-tooltip-title">
              {{ bucketFullTooltipLabel(hoveredBucket.bucket) }}
            </div>
            <div class="chart-tooltip-row">
              <strong>{{ formatMetricValue(hoveredBucket.bucket) }}</strong>
            </div>
            <div class="chart-tooltip-row">
              <span
                >{{ Math.round(hoveredBucket.bucket.minutes || 0) }} min
                escuchados</span
              >
            </div>
            <div class="chart-tooltip-row">
              <span>{{ hoveredBucket.bucket.plays || 0 }} reproducciones</span>
            </div>
            <div class="chart-tooltip-row is-muted">
              <span
                >{{
                  tooltipPercentOfTotal(
                    bucketMetricValue(hoveredBucket.bucket),
                  )
                }}% del periodo</span
              >
            </div>
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
            <span class="ranking-count" v-if="currentStats.topSongs.length"
              >{{ currentStats.topSongs.length }} canciones</span
            >
          </div>

          <div v-if="currentStats.topSongs.length" class="ranking-list">
            <div
              v-for="s in currentStats.topSongs"
              :key="s.id"
              class="ranking-item"
              @click="playRankingSong(s.id)"
            >
              <span class="rank-badge" :class="`rank-${s.rank}`">{{
                s.rank
              }}</span>
              <div class="ranking-cover">
                <img v-if="s.cover" :src="s.cover" :alt="s.title" />
                <SongIconCover v-else class="cover-icon" />
                <div class="play-overlay">
                  <Play :size="12" fill="currentColor" />
                </div>
              </div>
              <div class="ranking-meta">
                <span class="ranking-name" :title="s.title">{{ s.title }}</span>
                <span class="ranking-sub" @click.stop="goToArtist(s.artist)">{{
                  s.artist
                }}</span>
              </div>
              <div class="ranking-stats">
                <span class="rank-plays"
                  >{{ s.plays }} {{ s.plays === 1 ? "rep." : "reps." }}</span
                >
                <span class="rank-duration">{{ s.listenTimeFormatted }}</span>
              </div>
            </div>
          </div>
          <p v-else class="ranking-empty">
            No hay reproducciones registradas en este periodo.
          </p>
        </div>

        <!-- Top Artistas -->
        <div class="ranking-panel">
          <div class="ranking-header">
            <h4>
              <UserRound :size="15" />
              Top Artistas
            </h4>
            <span class="ranking-count" v-if="currentStats.topArtists.length"
              >{{ currentStats.topArtists.length }} artistas</span
            >
          </div>

          <div v-if="currentStats.topArtists.length" class="ranking-list">
            <div
              v-for="a in currentStats.topArtists"
              :key="a.name"
              class="ranking-item clickable-row"
              @click="goToArtist(a.name)"
            >
              <span class="rank-badge" :class="`rank-${a.rank}`">{{
                a.rank
              }}</span>
              <div class="ranking-avatar">
                <img v-if="a.cover" :src="a.cover" :alt="a.name" />
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
          <p v-else class="ranking-empty">
            No hay artistas registrados en este periodo.
          </p>
        </div>

        <!-- Top Álbumes -->
        <div class="ranking-panel">
          <div class="ranking-header">
            <h4>
              <DiscAlbum :size="15" />
              Top Álbumes
            </h4>
            <span class="ranking-count" v-if="currentStats.topAlbums.length"
              >{{ currentStats.topAlbums.length }} álbumes</span
            >
          </div>

          <div v-if="currentStats.topAlbums.length" class="ranking-list">
            <div
              v-for="alb in currentStats.topAlbums"
              :key="alb.id || alb.name"
              class="ranking-item clickable-row"
              @click="goToAlbum(alb.id)"
            >
              <span class="rank-badge" :class="`rank-${alb.rank}`">{{
                alb.rank
              }}</span>
              <div class="ranking-cover">
                <img v-if="alb.cover" :src="alb.cover" :alt="alb.name" />
                <DiscAlbum v-else :size="16" class="cover-icon" />
              </div>
              <div class="ranking-meta">
                <span class="ranking-name" :title="alb.name">{{
                  alb.name
                }}</span>
                <span class="ranking-sub">{{
                  alb.artist || "Varios artistas"
                }}</span>
              </div>
              <div class="ranking-stats">
                <span class="rank-plays">{{ alb.plays }} reps.</span>
                <span class="rank-duration">{{ alb.listenTimeFormatted }}</span>
              </div>
            </div>
          </div>
          <p v-else class="ranking-empty">
            No hay álbumes registrados en este periodo.
          </p>
        </div>
      </div>

      <!-- Recent Playback Activity -->
      <div
        v-if="currentStats.recentActivity.length"
        class="recent-activity-panel"
      >
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
              <div class="play-overlay">
                <Play :size="11" fill="currentColor" />
              </div>
            </div>
            <div class="activity-info">
              <span class="act-title">{{ act.title }}</span>
              <span class="act-artist" @click.stop="goToArtist(act.artist)">{{
                act.artist
              }}</span>
            </div>
            <span class="act-time-listened">{{ act.listenTimeFormatted }}</span>
            <span class="act-timestamp">{{
              formatRelativeTime(act.timestamp)
            }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================================
         APARIENCIA
         ============================================================ -->

    <section v-show="activeCategory === 'appearance'" class="profile-section">
      <h2>
        <Palette :size="17" />
        Apariencia
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Color de acento</strong>
            <p>Elige el tono neón que tiñe botones, progreso y detalles.</p>
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
              <Check v-if="user.profile.accentColor === opt.value" :size="13" />
            </button>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Menos animaciones</strong>
            <p>Reduce movimientos y transiciones en toda la aplicación.</p>
          </div>

          <ToggleSwitch
            v-model="user.profile.reducedMotion"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Visualizador de audio</strong>
            <p>Muestra el visualizador durante la reproducción.</p>
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

    <section v-show="activeCategory === 'playback'" class="profile-section">
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

    <section v-show="activeCategory === 'library'" class="profile-section">
      <h2>
        <LibraryIcon :size="17" />
        Biblioteca e Inicio
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Orden de la biblioteca</strong>
            <p>Cómo se ordenan tus canciones por defecto.</p>
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
            <p>Sección de contenido reciente en Inicio.</p>
          </div>

          <ToggleSwitch
            v-model="user.profile.homeShowHistory"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Mostrar álbumes más escuchados</strong>
            <p>Ranking según tu actividad real de escucha.</p>
          </div>

          <ToggleSwitch
            v-model="user.profile.homeShowTopAlbums"
            @update:modelValue="user.save()"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Mostrar playlists más escuchadas</strong>
            <p>Tus listas favoritas según el historial.</p>
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
            <p>Administra la carpeta donde Calliope busca tus canciones.</p>
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
              Selecciona una nueva carpeta donde se encuentran tus archivos de
              música.
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
              Desvincula la carpeta actual. Tus archivos originales no serán
              eliminados.
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

    <section v-show="activeCategory === 'settings'" class="profile-section">
      <h2>
        <SettingsIcon :size="17" />
        Ajustes
      </h2>

      <div class="pref-card">
        <div class="pref-row">
          <div class="pref-text">
            <strong>Biblioteca de Música</strong>
            <p>Administra la carpeta donde Calliope busca tus canciones.</p>
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
              Selecciona una nueva carpeta donde se encuentran tus archivos de
              música.
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
              Desvincula la carpeta actual. Tus archivos originales no serán
              eliminados.
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
              Comprueba y mantiene organizada la información de tus canciones.
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
            <p>Consulta, edita y analiza los metadatos de tus canciones.</p>
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
            <p>Busca nuevos archivos añadidos a la carpeta seleccionada.</p>
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
              Elimina la información guardada y vuelve a analizar todos los
              archivos.
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

    <section v-show="activeCategory === 'privacy'" class="profile-section">
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
            :model-value="
              Boolean(user.profile.private ?? user.profile.isPrivate)
            "
            @update:model-value="handleTogglePrivacy"
          />
        </div>

        <div class="pref-row">
          <div class="pref-text">
            <strong>Guardar historial de escucha</strong>
            <p>
              Registra lo que reproduces para potenciar las secciones de Inicio.
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

            <p v-else>Calliope es 100% local: nada sale de este dispositivo.</p>
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
              Vuelve a los valores originales de apariencia, reproducción y
              biblioteca.
            </p>
          </div>

          <button type="button" class="btn btn-ghost" @click="resetPreferences">
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

          <button type="button" class="btn btn-ghost" @click="handleLogout">
            <LogOut :size="14" />
            Cerrar sesión
          </button>
        </div>

        <div v-if="!user.isGuest" class="pref-row">
          <div class="pref-text">
            <strong>Eliminar perfil</strong>
            <p>
              Borra este perfil local, identidad y preferencias de este
              dispositivo.
            </p>
          </div>

          <button type="button" class="btn btn-danger" @click="wipeProfile">
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
          Para hacer privado este perfil, establece una contraseña. Se te pedirá
          cada vez que inicies sesión en este dispositivo.
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
  ChevronLeft,
  ChevronRight,
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
  TrendingDown,
  TrendingUp,
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
const metricOptions = [
  { id: "minutes", label: "Tiempo escuchado", unit: "min" },
  { id: "plays", label: "Reproducciones", unit: "" },
  { id: "songs", label: "Canciones distintas", unit: "" },
  { id: "artists", label: "Artistas distintos", unit: "" },
  { id: "albums", label: "Álbumes distintos", unit: "" },
];
const selectedPeriod = ref("all");
// Fecha ancla del periodo actualmente visualizado. null = periodo actual.
const periodAnchor = ref(null);
function selectPeriod(id) {
  selectedPeriod.value = id;
  periodAnchor.value = null;
  compareEnabled.value = false;
}
const selectedMetric = ref("minutes");
const compareEnabled = ref(false);
const periodTitle = computed(() => {
  const p = selectedPeriod.value;
  const anchor = periodAnchor.value ? new Date(periodAnchor.value) : new Date();
  const range = library.getPeriodRange(p, anchor);
  if (p === "day") {
    return range.start.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (p === "week") {
    const end = new Date(range.start);
    end.setDate(end.getDate() + 6);
    return `${range.start.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  if (p === "month") {
    return range.start.toLocaleDateString("es-ES", {
      month: "long",
      year: "numeric",
    });
  }
  return String(range.start.getFullYear());
});
const isCurrentPeriod = computed(() => {
  if (!periodAnchor.value) return true;
  const anchor = new Date(periodAnchor.value);
  const currentRange = library.getPeriodRange(selectedPeriod.value, new Date());
  const range = library.getPeriodRange(selectedPeriod.value, anchor);
  // El periodo es "actual" si su inicio coincide con el del periodo real, o
  // si el ancla cae DENTRO del periodo actual (evita quedar atrapado).
  return (
    range.start.getTime() === currentRange.start.getTime() ||
    (range.start.getTime() <= currentRange.anchor.getTime() &&
      currentRange.anchor.getTime() < range.end.getTime())
  );
});
const canGoNext = computed(() => {
  if (!isCurrentPeriod.value) {
    // Solo se puede avanzar si aún hay un periodo FUTURO, es decir, si el
    // periodo visualizado está ESTRICTAMENTE en el pasado respecto al actual.
    const anchor = periodAnchor.value
      ? new Date(periodAnchor.value)
      : new Date();
    const range = library.getPeriodRange(selectedPeriod.value, anchor);
    const currentAnchor = library.getPeriodRange(
      selectedPeriod.value,
      new Date(),
    ).anchor;
    return range.start.getTime() < currentAnchor.getTime();
  }
  return false;
});
const selectedPeriodLabel = computed(() => {
  const base =
    selectedPeriod.value === "day"
      ? "día"
      : selectedPeriod.value === "week"
        ? "semana"
        : selectedPeriod.value === "month"
          ? "mes"
          : "año";
  if (isCurrentPeriod.value) return `en este ${base}`;
  return periodTitle.value;
});
const currentStats = computed(() => {
  const anchor = periodAnchor.value ? new Date(periodAnchor.value) : null;
  return library.getProfileStats(selectedPeriod.value, anchor);
});
const compareStats = computed(() => {
  if (!compareEnabled.value) return null;
  const anchor = periodAnchor.value ? new Date(periodAnchor.value) : new Date();
  const prevAnchor = library.shiftPeriod(selectedPeriod.value, anchor, -1);
  return library.getProfileStats(selectedPeriod.value, prevAnchor);
});
// ============================================================
//   MÉTRICAS DEL GRÁFICO
// ============================================================
// Alterna entre métricas y devuelve el valor correspondiente de un bucket.
function bucketMetricValue(bucket) {
  const m = selectedMetric.value;
  if (m === "plays") return bucket.plays || 0;
  if (m === "songs") return bucket.uniqueSongs || 0;
  if (m === "artists") return bucket.uniqueArtists || 0;
  if (m === "albums") return bucket.uniqueAlbums || 0;
  return bucket.minutes || 0;
}
function bucketMatchesEvent(bucket, ev) {
  const p = selectedPeriod.value;
  const evDate = new Date(ev.timestamp || 0);
  if (p === "day") return evDate.getHours() === bucket.hour;
  if (p === "week" || p === "month")
    return bucket.date === toLocalDateStr(evDate);
  return (
    evDate.getMonth() === bucket.monthIndex &&
    evDate.getFullYear() === bucket.year
  );
}
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Buckets del gráfico con la métrica seleccionada. Para métricas "distintas"
// se recalculan a partir de los eventos del periodo consultado.
const chartBuckets = computed(() => {
  const stats = currentStats.value;
  const buckets = (stats?.chartData || []).map((b) => ({ ...b }));
  const metric = selectedMetric.value;
  if (metric === "minutes" || metric === "plays") return buckets;
  const start = stats?.periodStart || 0;
  const end = stats?.periodEnd || 0;
  const events = library.playbackEvents.filter((ev) => {
    const t = ev.timestamp || 0;
    return t >= start && t < end;
  });
  for (const b of buckets) {
    const set = new Set();
    for (const ev of events) {
      if (!bucketMatchesEvent(b, ev)) continue;
      let key = null;
      if (metric === "artists")
        key = ev.artist || ev.artists?.[0] || "Desconocido";
      else if (metric === "songs") key = ev.songId;
      else key = ev.albumId || ev.album || "desconocido";
      if (key) set.add(key);
    }
    b.uniqueSongs = metric === "songs" ? set.size : 0;
    b.uniqueArtists = metric === "artists" ? set.size : 0;
    b.uniqueAlbums = metric === "albums" ? set.size : 0;
  }
  return buckets;
});
const metricMax = computed(() => {
  const vals = chartBuckets.value.map((b) => bucketMetricValue(b));
  return Math.max(1, ...vals);
});
const metricTotal = computed(() => {
  return chartBuckets.value.reduce((acc, b) => acc + bucketMetricValue(b), 0);
});
const compareSeries = computed(() => {
  if (!compareStats.value) return null;
  const metric = selectedMetric.value;
  const compBuckets = (compareStats.value.chartData || []).map((b) => ({
    ...b,
  }));
  if (metric !== "minutes" && metric !== "plays") {
    const start = compareStats.value.periodStart || 0;
    const end = compareStats.value.periodEnd || 0;
    const events = library.playbackEvents.filter((ev) => {
      const t = ev.timestamp || 0;
      return t >= start && t < end;
    });
    for (const b of compBuckets) {
      const set = new Set();
      for (const ev of events) {
        if (!bucketMatchesEvent(b, ev)) continue;
        let key = null;
        if (metric === "artists")
          key = ev.artist || ev.artists?.[0] || "Desconocido";
        else if (metric === "songs") key = ev.songId;
        else key = ev.albumId || ev.album || "desconocido";
        if (key) set.add(key);
      }
      b.uniqueSongs = metric === "songs" ? set.size : 0;
      b.uniqueArtists = metric === "artists" ? set.size : 0;
      b.uniqueAlbums = metric === "albums" ? set.size : 0;
    }
  }
  return compBuckets.map((b) => bucketMetricValue(b));
});
// Diferencia para KPIs y tendencia.
const compareDelta = computed(() => {
  if (!compareStats.value) return null;
  const cur = currentStats.value;
  const prev = compareStats.value;
  const curTime = cur?.totalListenTime || 0;
  const prevTime = prev?.totalListenTime || 0;
  const diffTime = curTime - prevTime;
  const pct =
    prevTime > 0
      ? ((curTime - prevTime) / prevTime) * 100
      : curTime > 0
        ? 100
        : 0;
  return {
    diffTime,
    diffTimeFormatted: formatListenTimeAbs(Math.abs(diffTime)),
    pct: Math.round(pct * 10) / 10,
    positive: diffTime >= 0,
    prevTimeFormatted: library.formatListenTime(prevTime),
    diffPlays: (cur?.totalPlays || 0) - (prev?.totalPlays || 0),
  };
});
function formatListenTimeAbs(seconds) {
  if (!seconds || seconds <= 0) return "0 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function kpiDelta(key) {
  if (!compareStats.value) return null;
  const cur = currentStats.value;
  const prev = compareStats.value;
  let curVal = 0;
  let prevVal = 0;
  if (key === "time") {
    curVal = cur?.totalListenTime || 0;
    prevVal = prev?.totalListenTime || 0;
  } else if (key === "plays") {
    curVal = cur?.totalPlays || 0;
    prevVal = prev?.totalPlays || 0;
  } else if (key === "songs") {
    curVal = cur?.uniqueSongsCount || 0;
    prevVal = prev?.uniqueSongsCount || 0;
  } else if (key === "artists") {
    curVal = cur?.uniqueArtistsCount || 0;
    prevVal = prev?.uniqueArtistsCount || 0;
  } else if (key === "albums") {
    curVal = cur?.uniqueAlbumsCount || 0;
    prevVal = prev?.uniqueAlbumsCount || 0;
  }
  const diff = curVal - prevVal;
  return {
    diff,
    positive: diff >= 0,
    pct:
      prevVal > 0
        ? Math.round((diff / prevVal) * 1000) / 10
        : diff > 0
          ? 100
          : 0,
  };
}
// Navegación histórica.
function goPrevPeriod() {
  const anchor = periodAnchor.value ? new Date(periodAnchor.value) : new Date();
  periodAnchor.value = library
    .shiftPeriod(selectedPeriod.value, anchor, -1)
    .getTime();
}
function goNextPeriod() {
  if (!canGoNext.value) return;
  const anchor = periodAnchor.value ? new Date(periodAnchor.value) : new Date();
  periodAnchor.value = library
    .shiftPeriod(selectedPeriod.value, anchor, 1)
    .getTime();
}
function goToCurrentPeriod() {
  periodAnchor.value = null;
}
// ============================================================
//   GRÁFICO DE BARRAS + TOOLTIP
// ============================================================
const selectedMetricLabel = computed(() => {
  const m = metricOptions.find((o) => o.id === selectedMetric.value);
  return m ? m.label : "Tiempo escuchado";
});
function getBarHeightPercent(bucket) {
  const max = metricMax.value;
  const val = bucketMetricValue(bucket);
  if (!max) return 0;
  return Math.max(0, Math.min(100, (val / max) * 100));
}
function formatBarValue(bucket) {
  const m = selectedMetric.value;
  const v = bucketMetricValue(bucket);
  if (!v) return "";
  if (m === "minutes") return `${Math.round(v)}m`;
  return String(Math.round(v));
}
function formatMetricValue(bucket) {
  const m = selectedMetric.value;
  const v = bucketMetricValue(bucket);
  if (m === "minutes") return `${Math.round(v)} min escuchados`;
  if (m === "plays") return `${Math.round(v)} reproducciones`;
  if (m === "songs") return `${Math.round(v)} canciones distintas`;
  if (m === "artists") return `${Math.round(v)} artistas distintos`;
  return `${Math.round(v)} álbumes distintos`;
}
// Tooltip interactivo (hover en desktop, tap en móvil).
const hoveredBucket = ref(null);
function setHoveredBucket(h) {
  hoveredBucket.value = h;
}
function toggleHoveredBucket(h) {
  if (hoveredBucket.value && hoveredBucket.value.index === h.index) {
    hoveredBucket.value = null;
  } else {
    hoveredBucket.value = h;
  }
}
function clearHoveredBucket() {
  hoveredBucket.value = null;
}
const tooltipStyle = computed(() => {
  const h = hoveredBucket.value;
  if (!h || !chartBuckets.value.length) return { display: "none" };
  const n = chartBuckets.value.length;
  const leftPct = (h.index / n) * 100;
  const left = Math.max(6, Math.min(94, leftPct));
  return { left: `${left}%` };
});
function tooltipPercentOfTotal(value) {
  const total = metricTotal.value || 0;
  if (!total) return "0";
  return ((value / total) * 100).toFixed(1).replace(/\.?0+$/, "");
}
function bucketFullTooltipLabel(bucket) {
  if (!bucket) return "";
  const p = selectedPeriod.value;
  const monthsFull = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  if (p === "day") {
    const h = bucket.hour ?? 0;
    const next = (h + 1) % 24;
    return `${String(h).padStart(2, "0")}:00 – ${String(next).padStart(2, "0")}:00`;
  }
  if (p === "week") {
    if (
      bucket.year != null &&
      bucket.month != null &&
      bucket.dayOfMonth != null
    ) {
      const d = new Date(bucket.year, bucket.month, bucket.dayOfMonth);
      return d.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }
    return bucket.label || "";
  }
  if (p === "month") {
    if (
      bucket.year != null &&
      bucket.month != null &&
      bucket.dayNumber != null
    ) {
      const d = new Date(bucket.year, bucket.month, bucket.dayNumber);
      return d.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }
    return bucket.label || "";
  }
  if (bucket.monthIndex != null) {
    return `${monthsFull[bucket.monthIndex]} ${bucket.year || ""}`.trim();
  }
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
