<template>
    <main class="support-page">

    <header class="support-hero">

        <div class="support-icon">
        <Heart />
        </div>

        <h1>Ayuda a Calliope</h1>

        <p>
        Calliope es un proyecto independiente creado para ofrecer
        una forma sencilla, moderna y privada de disfrutar de tu
        propia música.
        </p>

        <p>
        Si te gusta el proyecto y quieres ayudar a que siga creciendo,
        puedes apoyarlo de forma totalmente voluntaria.
        </p>

    </header>


    <!-- APOYO PRINCIPAL -->

    <section class="support-main">

        <div class="support-heading">

        <HeartHandshake />

        <div>
            <h2>Apoya el proyecto</h2>

            <p>
            Cualquier apoyo ayuda a seguir desarrollando y mejorando Calliope.
            </p>
        </div>

        </div>


        <div class="support-options">


        <article class="support-card featured">

            <div class="support-card-icon">
            <Coffee />
            </div>

            <span class="support-label">
            Una vez
            </span>

            <h3>Invítame a un café</h3>

            <p>
            Un pequeño apoyo para agradecer el trabajo y seguir
            desarrollando nuevas funciones.
            </p>

            
            <a
                href="https://ko-fi.com/X8C424QA1Z"
                class="support-button"
                target="_blank"
                rel="noopener noreferrer"
            >
                <Coffee />
                Apoyar el proyecto
            </a>
        </article>


        <!-- <article class="support-card">

            <div class="support-card-icon">
            <Heart />
            </div>

            <span class="support-label">
            Recurrente
            </span>

            <h3>Apoyo mensual</h3>

            <p>
            Ayuda a mantener el desarrollo de Calliope a largo plazo
            con una pequeña aportación mensual.
            </p>

            <a
            href="#"
            class="support-button"
            target="_blank"
            rel="noopener noreferrer"
            >
            <Heart />
            Apoyar mensualmente
            </a>

        </article> -->


        <article class="support-card">

            <div class="support-card-icon">
            <Gift />
            </div>

            <span class="support-label">
            Alternativa
            </span>

            <h3>Otra forma de ayudar</h3>

            <p>
            También puedes ayudar compartiendo el proyecto, informando
            de errores o proponiendo nuevas funciones.
            </p>

            <a
            href="https://github.com/Jpergon251/project-calliope"
            class="support-button secondary"
            target="_blank"
            rel="noopener noreferrer"
            >
            <Github />
            Ver GitHub
            </a>

        </article>

        </div>

    </section>


    <!-- EN QUÉ AYUDA -->

    <section class="support-benefits">

        <div class="section-heading">

        <Sparkles />

        <div>
            <h2>¿En qué ayuda tu apoyo?</h2>

            <p>
            Las aportaciones ayudan a mantener y mejorar el proyecto.
            </p>
        </div>

        </div>


        <div class="benefits-grid">

        <article class="benefit-card">

            <Code2 />

            <h3>Desarrollo</h3>

            <p>
            Crear nuevas funciones y mejorar la experiencia de uso.
            </p>

        </article>


        <article class="benefit-card">

            <Bug />

            <h3>Corrección de errores</h3>

            <p>
            Investigar y solucionar problemas para hacer Calliope
            más estable.
            </p>

        </article>


        <article class="benefit-card">

            <Wrench />

            <h3>Mantenimiento</h3>

            <p>
            Mantener el proyecto actualizado y compatible con nuevas
            versiones de navegadores y tecnologías.
            </p>

        </article>


        <article class="benefit-card">

            <Rocket />

            <h3>Nuevas funciones</h3>

            <p>
            Convertir nuevas ideas en funciones reales para Calliope.
            </p>

        </article>

        </div>

    </section>


    <!-- OTRAS FORMAS DE AYUDAR -->

    <section class="support-other">

        <div class="section-heading">

        <Users />

        <div>
            <h2>También puedes ayudar de otras formas</h2>

            <p>
            No es necesario realizar una donación para contribuir al proyecto.
            </p>
        </div>

        </div>


        <div class="other-help-grid">

        <article class="other-help-card">

            <Bug />

            <h3>Informar de errores</h3>

            <p>
            Si encuentras un problema, puedes informar de él para ayudar
            a mejorar Calliope.
            </p>

            <a
            href="https://github.com/Jpergon251/project-calliope/issues"
            target="_blank"
            rel="noopener noreferrer"
            >
            Informar de un error
            <ArrowUpRight />
            </a>

        </article>


        <article class="other-help-card">

            <Lightbulb />

            <h3>Proponer ideas</h3>

            <p>
            Las sugerencias de nuevas funciones también ayudan a decidir
            hacia dónde puede evolucionar el proyecto.
            </p>

            <a
            href="https://github.com/Jpergon251/project-calliope/issues"
            target="_blank"
            rel="noopener noreferrer"
            >
            Proponer una idea
            <ArrowUpRight />
            </a>

        </article>


        <article class="other-help-card">

            <Share2 />

            <h3>Compartir Calliope</h3>

            <p>
            Recomendar el proyecto a otras personas también es una forma
            de ayudar.
            </p>

        </article>

        </div>

    </section>


    <!-- MENSAJE FINAL -->

    <section class="support-thanks">

        <Heart class="thanks-icon" />

        <h2>Gracias por apoyar Calliope</h2>

        <p>
        Ya sea utilizando la aplicación, informando de errores,
        compartiendo el proyecto o realizando una donación,
        cualquier forma de apoyo es bienvenida.
        </p>

    </section>


    <footer class="support-footer">

        <span>© 2026 Calliope</span>

        <span>
        Proyecto independiente
        </span>

    </footer>

    </main>
</template>

<script setup>
import {
    Heart,
    HeartHandshake,
    Coffee,
    Gift,
    Github,
    Sparkles,
    Code2,
    Bug,
    Wrench,
    Rocket,
    Users,
    Lightbulb,
    Share2,
    ArrowUpRight
} from 'lucide-vue-next';
</script>