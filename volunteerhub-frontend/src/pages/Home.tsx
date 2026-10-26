import { useEffect, useState } from "react";
import { Link } from "react-router";
import HeartIcon from "../design/HeartIcon";
import heartCloudLadder from "../design/assets/heart-cloud-ladder.png";

const WORDS = ["קניות לשכנה", "הסעה לקופת חולים", "שיעורי עזר", "תיקון קטן בבית", "אריזת סלי מזון"];

const greetingFor = (hour: number) =>
  hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : hour < 21 ? "ערב טוב" : "לילה טוב";

const Home = () => {
  const [wordIndex, setWordIndex] = useState(0);
  const [greeting] = useState(() => greetingFor(new Date().getHours()));

  useEffect(() => {
    const timer = window.setInterval(() => setWordIndex((i) => (i + 1) % WORDS.length), 2800);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <section className="vh-hero">
        <div className="vh-hero__text">
          <span className="vh-pill">{greeting}, כל מדרגה מקרבת ללב</span>
          <h1 className="vh-hero__title">מטפסים יחד<br />אל היעד.</h1>
          <p className="vh-hero__line">
            היום אפשר לעזור ב<span key={wordIndex} className="vh-word">{WORDS[wordIndex]}</span>
          </p>
          <p className="vh-hero__lead">
            מפרסמים בקשה, מנהל מאשר, ומתנדבים מהאזור מציעים יד. כל עזרה קטנה היא עוד שליבה בסולם.
          </p>
          <div className="vh-hero__actions">
            <Link to="/requests" className="vh-btn vh-btn--heart">
              <HeartIcon size={20} color="#fff" />
              אני רוצה לעזור
            </Link>
            <Link to="/requests/new" className="vh-btn vh-btn--cloud">אני צריך עזרה</Link>
          </div>
          <span className="vh-pill">טיפ: הזיזו את העכבר או לחצו בכל מקום</span>
        </div>

        <div className="vh-hero__visual">
          <div className="vh-photo">
            <img src={heartCloudLadder} alt="ענן צמר גפן ורוד בצורת לב עם לב אדום, וסולם ורוד שמוביל אליו בשמיים כחולים" />
            <span className="vh-photo__badge" aria-hidden="true">
              <HeartIcon size={46} color="#E3304C" className="vh-beat" />
            </span>
          </div>
        </div>
      </section>

      <section className="vh-steps" aria-labelledby="vh-steps-title">
        <div className="vh-steps__intro">
          <h2 id="vh-steps-title" className="vh-title">שלוש שליבות<br />עד הלב</h2>
          <p className="vh-subtitle">כך בקשה הופכת לעזרה אמיתית. כל שליבה היא שלב, ובראש הסולם מחכה חיוך.</p>
        </div>
        <ol className="vh-steps__ladder" style={{ listStyle: "none", margin: 0 }}>
          <li className="vh-card vh-step">
            <span className="vh-step__num" style={{ background: "#FCD3E0", color: "#B8203F" }}>1</span>
            <div>
              <h3>מפרסמים בקשה</h3>
              <p className="vh-card__text">במה צריך עזרה, באיזה אזור ועד מתי. אפשר לצרף עד 5 תמונות.</p>
            </div>
          </li>
          <li className="vh-card vh-step">
            <span className="vh-step__num" style={{ background: "#CFF1F4", color: "#136B7A" }}>2</span>
            <div>
              <h3>מנהל מאשר</h3>
              <p className="vh-card__text">כל בקשה נבדקת לפני הפרסום, כדי שהשמיים כאן יישארו בהירים.</p>
            </div>
          </li>
          <li className="vh-card vh-step">
            <span className="vh-step__num" style={{ background: "#E3304C" }}>
              <HeartIcon size={28} color="#fff" />
            </span>
            <div>
              <h3>מגיעים ללב</h3>
              <p className="vh-card__text">מתנדבים מציעים יד. הכתובת המדויקת נחשפת רק למתנדב שנבחר.</p>
            </div>
          </li>
        </ol>
      </section>

      <footer className="vh-footer">VolunteerHub · כל עזרה היא שליבה בסולם</footer>
    </>
  );
};

export default Home;
