<div align="center">

# 🏡 BookNest

### Find your next stay — from cozy rooms to castles, treehouses and beachfront villas.

A full-stack room & stay booking platform built with the **MERN** stack.


**[🌐 Live Demo](https://booknest-b1ec.onrender.com/listings)** · **[🐞 Report a Bug](../../issues)** · **[✨ Request a Feature](../../issues)**

</div>

---

## 📖 About

**BookNest** is a modern stay-booking platform inspired by Airbnb, OYO and Booking.com. Guests can explore stays by category, filter by price and group size, and see transparent pricing with GST. Hosts can list their own properties and manage them from the same platform.

> 🎓 Built as an academic project at **G.N. Khalsa College** (TYIT) to practise real-world full-stack development — MVC architecture, authentication, image uploads, maps, database relationships and cloud deployment.

> ⏳ **Note:** The app is hosted on Render. If it hasn't been visited for a while, the first load can take ~30–60 seconds while the server wakes up.

---

## ✨ Features

- 🔍 **Explore listings** — browse a growing catalogue of rooms, villas, cabins, resorts and more
- 🗂️ **Category browsing** — Trending, Rooms, Iconic cities, Mountains, Castles, Amazing Pools, Camping, Farms, Arctic, Domes and Boats
- 🎚️ **Smart filters** — filter by price range (per night) and minimum number of guests
- 💰 **Transparent pricing** — per-night prices with an *18% GST* indicator and a **"Display total after taxes"** toggle
- 🔐 **Authentication** — sign up and log in securely
- 🏠 **Become a host** — create and manage your own listings
- 🖼️ **Image uploads** for listings
- 🗺️ **Map integration** to show where a stay is located
- 📱 **Responsive design** — works across desktop, tablet and mobile
- 📄 **Privacy & Terms** pages

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React (Vite), CSS |
| **Backend** | Node.js, Express.js (MVC architecture) |
| **Database** | MongoDB with Mongoose, hosted on MongoDB Atlas |
| **Deployment** | Render |

---

## 📸 Screenshots

<!-- Add your screenshots to a /screenshots folder and update the paths below -->

| Home / Listings | Listing Details |
|:---:|:---:|
| ![Listings](./screenshots/listings.png) | ![Details](./screenshots/details.png) |

| Filters | Become a Host |
|:---:|:---:|
| ![Filters](./screenshots/filters.png) | ![Host](./screenshots/host.png) |
---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [MongoDB Atlas](https://www.mongodb.com/atlas) account (or a local MongoDB instance)
- npm or yarn

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>
```

### 2. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Configure environment variables

Create a `.env` file in the **backend** folder:

```env
PORT=8080
MONGO_URL=your_mongodb_atlas_connection_string
SESSION_SECRET=your_secret_key

# Add any keys your project uses (image upload service, map provider, etc.)
```

> ⚠️ Never commit your `.env` file. Make sure it's listed in `.gitignore`.

### 4. Run the app

```bash
# Start the backend
cd backend
npm start

# In a new terminal, start the frontend
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 📁 Project Structure

```
BookNest/
├── backend/
│   ├── models/         # Mongoose schemas (User, Listing, Review, ...)
│   ├── controllers/    # Request-handling logic (MVC)
│   ├── routes/         # Express routes
│   ├── middleware/     # Auth & validation
│   └── app.js          # Entry point
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── main.jsx
│   └── index.html
└── README.md
```

> Adjust the tree above to match your actual folder layout.

---

## 🗺️ Roadmap

- [x] Backend with Express & MongoDB
- [x] Database relationships (users, listings, reviews)
- [x] MVC refactor
- [x] Image upload
- [x] Maps integration
- [x] Category & price/guest filters
- [x] MongoDB Atlas setup
- [x] Deployment on Render
- [ ] Online payments
- [ ] Booking calendar with availability
- [ ] Wishlist / favourites
- [ ] Host dashboard with analytics

---

## 🤝 Contributing

Contributions, issues and feature requests are welcome!

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 👨‍💻 Author

**Krishna Koneri**
Third-year IT student · Full-stack developer


- LinkedIn: [Krishna Koneri]([https://linkedin.com/in/your-linkedin](https://www.linkedin.com/in/krishna-koneri-2ba504337/))

---

## 📜 License

This project is for educational purposes. Add a license of your choice (e.g. [MIT](https://choosealicense.com/licenses/mit/)) if you plan to open-source it.

---

<div align="center">

⭐ If you like this project, give it a star — it really helps!

Made with ❤️ using the MERN stack

</div>
