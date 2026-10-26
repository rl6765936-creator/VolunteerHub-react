import Routers from "./app/Routers"
import Header from "./components/Header"
import Ambience from "./design/Ambience"
import CursorTrail from "./design/CursorTrail"

function App() {

  return (
    <>
    <Ambience/>
    <CursorTrail/>
    <div className="vh-shell">
      <Header/>
      <div className="vh-page">
        <Routers/>
      </div>
    </div>
    </>
  )
}

export default App
