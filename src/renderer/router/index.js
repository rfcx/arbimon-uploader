import Vue from 'vue'
import Router from 'vue-router'

Vue.use(Router)

export default new Router({
  routes: [
    {
      path: '/',
      name: 'landing-page',
      component: require('@/components/LandingPage').default
    },
    {
      path: '/import',
      name: 'import-files',
      component: require('@/components/ImportFiles/ImportFilesPage').default
    },
    {
      path: '/select-site',
      name: 'select-site',
      component: require('@/components/ImportToSitePage/ImportToSitePage').default,
      props: (route) => ({ query: route.query })
    },
    {
      path: '/api-service',
      name: 'api-service',
      component: require('@/components/APIService').default
    },
    {
      path: '/about',
      name: 'about-page',
      component: require('@/components/AboutPage').default
    },
    {
      path: '/update',
      name: 'update-page',
      component: require('@/components/UpdatePage').default
    },
    {
      path: '/preferences',
      name: 'preferences-page',
      component: require('@/components/PreferencesPage').default
    },
    {
      path: '/edit-stream-location',
      name: 'edit-stream-location-page',
      component: require('@/components/EditStreamLocation/EditStreamLocationPage').default,
      props: (route) => ({ query: route.query })
    },
    {
      path: '*',
      redirect: '/'
    }
  ]
})
