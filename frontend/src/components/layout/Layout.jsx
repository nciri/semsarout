import RouteOutlet from '../common/RouteOutlet'
import Header from './Header'
import Footer from './Footer'

function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <RouteOutlet />
      </main>
      <Footer />
    </div>
  )
}

export default Layout
