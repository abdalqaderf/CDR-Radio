const music = [
  ['جلسة خفيفة', 'Easy Lemon', 'USUAN1200076'],
  ['استراحة هادئة', 'Study And Relax', 'USUAN1900030'],
  ['بوسا المساء', 'Bossa Antigua', 'USUAN1700069'],
]
const recitations = [
  ['سورة الإخلاص', '112', 'Al-Ikhlas'],
  ['سورة الفلق', '113', 'Al-Falaq'],
  ['سورة الناس', '114', 'Al-Nas'],
]

export function AudioCredits() {
  return <section id="audio-credits" className="state-panel audio-credits" aria-labelledby="credits-title">
    <h2 id="credits-title">مصادر المقاطع الصوتية</h2>
    <h3>الموسيقى الهادئة</h3>
    <p>تأليف وتسجيل Kevin MacLeod من Incompetech. أُعيد ترميز الملفات مع الحفاظ على طولها.</p>
    <ul>
      {music.map(([title, original, code]) => <li key={code}>
        {title} · <a href={'https://incompetech.com/music/royalty-free/index.html?isrc=' + code} dir="ltr">{original}</a>
      </li>)}
    </ul>
    <a href="https://creativecommons.org/licenses/by/4.0/" dir="ltr">CC BY 4.0</a>
    <h3>تلاوات القرآن</h3>
    <p>تلاوة عاقب عزيز برواية حفص عن عاصم. نُشرت التسجيلات الأصلية باسم Atcovi.</p>
    <ul>
      {recitations.map(([title, chapter, transliteration]) => <li key={chapter}>
        <a href={'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(
          "Chapter " + chapter + ", " + transliteration + " (Mujawwad) - Recitation of the Holy Qur'an.mp3",
        )}>{title}</a>
      </li>)}
    </ul>
    <a href="https://creativecommons.org/publicdomain/zero/1.0/" dir="ltr">CC0 1.0</a>
    <h3>رسائل الترحيب</h3>
    <p>نصّان أصليان أُعدّا للتجربة بصوت عربي مركّب محليًا باستخدام eSpeak NG.</p>
  </section>
}
