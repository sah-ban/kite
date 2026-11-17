export const legalContact='kite@sahban.dev';
export const legalUpdated='November 17, 2026';
export const legalDocuments={
  privacy:{
    title:'Privacy policy',
    description:'How Kite handles your account, public Farcaster data, device storage, uploads, and notifications.',
    sections:[
      {id:'scope',title:'Who this policy covers',paragraphs:[
        'Kite is a Farcaster client maintained by @kiteapp. This policy covers the Kite Android app, this website, and the services operated for Kite. Independent deployments and third-party Farcaster clients have their own operators and policies.',
        'For privacy questions or requests about data held by Kite, email kite@sahban.dev. Farcaster is a public, decentralized network; information you publish can be copied and retained by other participants.'
      ]},
      {id:'data',title:'Data Kite uses',bullets:[
        'Public Farcaster data: your FID, profile fields, public wallet verifications, signer public keys, casts, embeds, follows, and reactions. Profile fields may include a location or linked social accounts that you chose to publish.',
        'Account connection data: the public key, FID, approval status, and authentication claims needed to connect an existing Farcaster account. The Android app does not request your custody recovery phrase.',
        'Notification data, when enabled: your FID, a random installation identifier, push token, notification preferences, and delivery status.',
        'Content you choose to submit: signed casts, reactions, follows, profile changes, image uploads, and GIF search queries.',
        'Network information: requests expose IP addresses, request times, requested URLs, and technical headers to the Kite service, its hosting providers, and any services contacted directly. Operational logs may contain request and error information.'
      ]},
      {id:'purpose',title:'Why this data is used',paragraphs:[
        'Kite uses this information to display public profiles and conversations, build feeds, authenticate actions, submit messages you authorize, provide uploads and previews, deliver optional notifications, and operate and troubleshoot the service.',
        'Kite does not sell personal data. The app does not include advertising SDKs or use an advertising identifier.'
      ]},
      {id:'keys',title:'Signer keys and local storage',paragraphs:[
        'On Android, the app signer private key is stored in Expo SecureStore using Android Keystore-backed encryption. The app signs actions on the device and sends signed messages or signed authentication claims to the service, rather than uploading that private key. Signing out removes the saved app key from the device after any required push unregistration succeeds.',
        'The website has different connection modes. Farcaster approval on the website creates a browser-bound signer session whose private key is encrypted on the Kite server. Those connections last up to 30 days, while pending approvals expire after ten minutes. Localhost account tools instead use an encrypted browser vault; optional remembered access lasts up to 30 days.',
        'Drafts, search history, theme and haptic preferences, notification read markers, and other local settings are stored on your device or browser. Signing out does not automatically clear all drafts, history, or preferences. You can remove drafts and search history in the app, or clear app/browser storage to remove local data.',
        'A client signer authorizes Farcaster actions. It is separate from the custody wallet recovery phrase and does not authorize moving wallet funds.'
      ]},
      {id:'providers',title:'Services and other recipients',paragraphs:[
        'Public actions are submitted to Farcaster through Snapchain. Farcaster approval uses the Farcaster approval service, and the website may use Farcaster’s profile API for follower counts.',
        'Images selected for upload are sent through Kite to ImgBB. GIF search uses a Tenor-backed service. Embeds may load media from the original publisher, and link previews may be fetched by the Kite server. X previews may use X’s public syndication service. Website fonts load from Google Fonts.',
        'If you enable push notifications, Kite uses Expo Push Service and Firebase Cloud Messaging. These providers receive the information needed to deliver notifications. Notification payloads describe the activity and include routing identifiers; they do not include the cast body.',
        'Opening an external link or miniapp can send information directly to that site or application, which has its own privacy policy. Providers and hosting infrastructure may process information outside your country.'
      ],links:[{label:'ImgBB privacy policy',href:'https://imgbb.com/privacy'},{label:'Google privacy policy',href:'https://policies.google.com/privacy'},{label:'Expo privacy policy',href:'https://expo.dev/privacy'}]},
      {id:'retention',title:'Retention and deletion',paragraphs:[
        'The feed and notification index uses a configurable history window of 30 days by default. Expired content is cleaned up periodically; deletion markers may be retained for up to 45 days. Account enrollments, push registrations, operational records, and backups have separate lifecycles and are not all removed by that history cleanup.',
        'Disabling notifications stops new push delivery for that installation; it does not itself erase every registration or delivery record. Uploaded images have no expiration configured by Kite. Removing an attachment from a draft or deleting a cast does not delete its hosted ImgBB image.',
        'You can request deletion of data held by the Kite service. We may ask you to prove control of the relevant FID without providing a private key or recovery phrase. We will explain what can be deleted and any records that must be retained for security, backup recovery, or legal obligations. Infrastructure log and backup retention depends on the hosting configuration.',
        'Kite cannot guarantee deletion from other Farcaster nodes, clients, image hosts, caches, or third-party archives. Deleting local app data does not delete public network messages.'
      ],links:[{label:'Request data deletion',href:'/data-deletion'}]},
      {id:'choices',title:'Your choices and requests',paragraphs:[
        'You can browse without connecting an account, choose whether to enable notifications, deny optional permissions, remove local drafts and searches, and disconnect your account. You can manage registered signers through a Farcaster client that provides that function; signing out of Kite does not revoke the signer’s network registration.',
        'Depending on where you live, you may have rights to access, correct, export, restrict, object to processing of, or request erasure of personal data. Contact kite@sahban.dev with your request. Do not send recovery phrases, private keys, or passwords. If you believe a child has provided private information to Kite, please contact us.'
      ]},
      {id:'changes',title:'Changes to this policy',paragraphs:['Updates will be published on this page with a revised date. Material changes to how Kite handles private information will be explained through an appropriate notice.']}
    ]
  },
  terms:{
    title:'Terms of use',
    description:'Terms for using Kite and its services on the decentralized Farcaster network.',
    sections:[
      {id:'use',title:'Using Kite',paragraphs:[
        'These terms apply to the Kite app, website, and services operated by the Kite maintainer. By using them, you agree to these terms and the community guidelines. You must have the legal capacity and any consent required to use the service.',
        'Kite connects to an existing Farcaster account. It does not take ownership of your FID or custody wallet. You are responsible for the actions you authorize and for protecting your devices, recovery phrase, and app keys.'
      ],links:[{label:'Community guidelines',href:'/community-guidelines'},{label:'Privacy policy',href:'/privacy'}]},
      {id:'content',title:'Your content and public actions',paragraphs:[
        'You retain any rights you hold in the content you submit. You give Kite the permission needed to transmit, store, index, and display that content to provide the service. Submit only content you have the right to share.',
        'Casts, profile updates, follows, reactions, and other protocol messages may be public and may be copied by other Farcaster participants. A deletion submitted through Kite does not guarantee removal from third-party systems or backups.'
      ]},
      {id:'conduct',title:'Acceptable use',paragraphs:[
        'Do not use Kite to distribute illegal content, child sexual abuse material, credible threats, targeted harassment, hateful abuse, private information without authorization, impersonation, scams, malware, or disruptive spam. Do not attack the service, bypass access controls, or use another person’s account without permission.',
        'The community guidelines explain these rules and how to contact the maintainer about violations. Access to services operated for Kite may be restricted to protect users or respond to misuse.'
      ]},
      {id:'protocol',title:'A client on a decentralized network',paragraphs:[
        'Kite is a client for Farcaster, not the owner of the Farcaster network. The availability and retention of protocol messages depend on the network, storage limits, and other participants.',
        'Moderation or visibility restrictions in one client do not constitute a network-wide block. They cannot prevent another client or network participant from displaying public content or interacting with a public account. Kite’s currently available reporting and blocking controls are described in the community guidelines.'
      ]},
      {id:'providers',title:'Third-party services',paragraphs:[
        'Approval, image hosting, GIF search, push delivery, media playback, and external links may involve third parties with their own terms. Kite does not control their availability or data retention. You are responsible for any network storage costs or third-party transactions you choose to make.'
      ]},
      {id:'availability',title:'Availability and responsibility',paragraphs:[
        'Kite is provided as available, without a guarantee of uninterrupted access, completeness of public data, delivery of notifications, or preservation of drafts. Keep your own copies of important content and protect your account credentials.',
        'To the extent permitted by applicable law, Kite and its maintainer disclaim warranties and liability for indirect losses arising from use of the service. These terms do not exclude rights or liabilities that cannot lawfully be excluded.'
      ]},
      {id:'ending',title:'Stopping use and changes',paragraphs:[
        'You can stop using Kite and disconnect your account at any time. To request deletion of private records held by the Kite service, use the data-deletion instructions. Disconnecting does not delete your Farcaster account or revoke every registered signer.',
        'Changes to these terms will be published here with an updated date. For questions, contact kite@sahban.dev.'
      ],links:[{label:'Data-deletion instructions',href:'/data-deletion'}]}
    ]
  },
  'community-guidelines':{
    title:'Community guidelines',
    description:'Rules for using Kite, reporting concerns, and understanding moderation on a decentralized network.',
    sections:[
      {id:'respect',title:'Respect people and their rights',paragraphs:['Use Kite to participate without threatening, exploiting, or abusing others. These guidelines apply to content and activity accessed or submitted through Kite.'],bullets:[
        'No child sexual abuse material, sexual exploitation, grooming, or content that endangers children.',
        'No credible threats, promotion of violence, targeted harassment, or hateful abuse.',
        'No doxxing, non-consensual intimate content, or sharing private information without authorization.',
        'No fraud, deceptive impersonation, phishing, malware, or attempts to obtain recovery phrases or private keys.',
        'No illegal content, infringement of others’ rights, or disruptive spam. Do not use Kite to distribute sexually explicit content.'
      ]},
      {id:'report',title:'Report a concern',paragraphs:[
        'Email kite@sahban.dev with the cast or profile link, the relevant FID if known, and a brief explanation. For child-safety concerns, identify the report as a child-safety concern. Do not attach or redistribute illegal material; provide a link or identifying information instead.',
        'The maintainer can investigate reports about Kite and consider appropriate action within services operated for Kite. If someone faces immediate danger, contact the appropriate emergency service.',
        'Reports can currently be sent by email. In-app reporting and personal user blocking are not yet available in Kite.'
      ]},
      {id:'decentralization',title:'What moderation can and cannot do',paragraphs:[
        'Farcaster is decentralized. Snapchain does not provide a protocol-wide blocking command. A client can implement its own visibility filters and blocking preferences without changing the underlying protocol.',
        'Any restriction applied by Kite affects only Kite’s service or what Kite displays. It does not erase content from other nodes or clients and cannot prevent someone from interacting through another client. A removal request about private Kite records is different from a public-protocol deletion.'
      ],links:[{label:'Data-deletion instructions',href:'/data-deletion'}]}
    ]
  },
  'data-deletion':{
    title:'Data deletion',
    description:'How to request deletion of Kite service data and remove data stored on your device.',
    sections:[
      {id:'request',title:'Request deletion of Kite service data',paragraphs:[
        'Email kite@sahban.dev with the subject “Kite data deletion” and your Farcaster FID. State whether your request concerns account enrollment, push registrations and delivery records, or another record held by Kite. You do not need to keep the app installed to make a request.',
        'We may ask you to prove control of the FID using a public-account action or another appropriate verification method. Never send a recovery phrase, private key, password, or app-key encryption passphrase.',
        'We will review the request, explain which records can be removed, and identify any records that need to be retained for security, backup recovery, or legal obligations. Removing your enrollment alone may not remove public casts shared in other users’ feed indexes. Connecting again can create a new enrollment.'
      ]},
      {id:'device',title:'Remove data from your device or browser',bullets:[
        'Turn off push notifications in Kite Settings, then sign out to disconnect the saved signer. Push unregistration may require an internet connection.',
        'Delete saved drafts in the composer’s Drafts screen and clear recent searches from Search.',
        'Clear Kite’s app storage in Android settings, or clear this website’s browser storage, to remove remaining local preferences and cached data. This does not submit a network deletion.',
        'Use a Farcaster client with signer-management tools if you also want to revoke the registered Kite signer. Sign-out is not signer revocation.'
      ]},
      {id:'public',title:'Public Farcaster content and uploaded images',paragraphs:[
        'You can delete your own casts through Kite while a valid connected signer has the required permissions. This submits a protocol deletion; Kite cannot guarantee erasure from independent clients, nodes, archives, or caches. These instructions do not delete your FID or custody wallet.',
        'Images uploaded through Kite are hosted by ImgBB without a configured expiration. Deleting the draft or cast does not delete the hosted file. Include the image URL when contacting us about an upload; provider-side deletion depends on the host’s controls and policies.'
      ],links:[{label:'Privacy policy',href:'/privacy'},{label:'ImgBB privacy policy',href:'https://imgbb.com/privacy'}]}
    ]
  }
};

const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// Public policy text is served in the initial HTML so it is readable without JS.
export function renderLegalContent(page){
  if(!Object.hasOwn(legalDocuments,page))return '';
  const document=legalDocuments[page];
  const links=items=>items.map(link=>`<a href="${escape(link.href)}">${escape(link.label)}</a>`).join('');
  return `<main class="legal-page"><div class="eyebrow">KITE · POLICIES</div><h1>${escape(document.title)}</h1><p class="legal-intro">${escape(document.description)}</p><p class="legal-updated">Last updated ${legalUpdated}</p><nav class="legal-nav" aria-label="Kite policies">${links(Object.entries(legalDocuments).map(([key,value])=>({href:`/${key}`,label:value.title})))}</nav><div class="legal-content">${document.sections.map(section=>`<section aria-labelledby="${escape(section.id)}"><h2 id="${escape(section.id)}">${escape(section.title)}</h2>${(section.paragraphs||[]).map(text=>`<p>${escape(text)}</p>`).join('')}${section.bullets?`<ul>${section.bullets.map(text=>`<li>${escape(text)}</li>`).join('')}</ul>`:''}${section.links?`<div class="legal-links">${links(section.links)}</div>`:''}</section>`).join('')}</div><footer class="legal-footer"><p>Contact Kite: <a href="mailto:${legalContact}">${legalContact}</a></p><a href="/">Back to Kite</a></footer></main>`;
}
