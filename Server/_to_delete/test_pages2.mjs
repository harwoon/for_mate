import * as service from "./src/modules/pages/pages.service.js"

const about = await service.getAbout()
console.log("about.heroTitleLines:", about.heroTitleLines)
console.log("about.heroActions:", about.heroActions)
console.log("about.steps.length:", about.steps.length)
console.log("about.banner:", about.banner)
console.log("about.cta:", about.cta)

const terms = await service.getTerms()
console.log("terms.title:", terms.title)
const privacy = await service.getPrivacy()
console.log("privacy.title:", privacy.title)

console.log("OK")
