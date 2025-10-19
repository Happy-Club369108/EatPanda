const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcrypt");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

const app = express();

// ====== MIDDLEWARE ======
app.use(express.json());
app.use(cors()); // For production, configure specific origins

// ====== CLOUDINARY CONFIG ======
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// ====== CLOUDINARY STORAGE FOR MULTER ======
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

const parser = multer({ storage });

// ====== MONGOOSE CONFIG ======
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB Connection Error:", err));

// ====== SCHEMAS ======
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  price: { type: Number, required: true },
  category: { type: String, default: "" },
  image: { type: String, required: true },
});
const Product = mongoose.model("Product", productSchema);

const userSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, default: "" },
  city: { type: String, default: "" },
  location: { type: String, default: "" },
}, { autoIndex: true }); // ensures unique index is created
const User = mongoose.model("User", userSchema);


const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, default: 1 },
});
const Cart = mongoose.model("Cart", cartSchema);

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      quantity: { type: Number, required: true },
    },
  ],
  location: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ["pending", "delivered", "canceled"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});
const Order = mongoose.model("Order", orderSchema);

// ====== USER ROUTES ======

// Get user profile
app.get("/user/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("Fetch User Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Update user profile
app.put("/user/update/:userId", async (req, res) => {
  try {
    const { fullName, city, location } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      { fullName, city, location },
      { new: true }
    ).select("-password");
    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// ====== AUTH ROUTES ======

// Signup
app.post("/signup", async (req, res) => {
  const { phoneNumber, password } = req.body;
  try {
    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) return res.status(409).json({ message: "Phone number already registered." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ phoneNumber, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully", userId: newUser._id });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { phoneNumber, password } = req.body;
  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) return res.status(401).json({ message: "Invalid phone number or password." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid phone number or password." });

    res.status(200).json({ message: "Login successful", userId: user._id });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// ====== PRODUCT ROUTES ======

// Upload product
app.post("/upload", parser.single("image"), async (req, res) => {
  try {
    const { name, description, price, category } = req.body;
    if (!name || !price || !req.file?.path) return res.status(400).json({ message: "Name, price, and image are required." });

    const imageUrl = req.file.path;
    const newProduct = new Product({ name, description, price: Number(price), category, image: imageUrl });
    await newProduct.save();
    res.status(201).json({ message: "Product uploaded successfully", product: newProduct });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Get all products
app.get("/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    console.error("Fetch Products Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// ====== CART ROUTES ======

// Add to cart
app.post("/cart/add", async (req, res) => {
  const { userId, productId, quantity } = req.body;
  try {
    let item = await Cart.findOne({ userId, productId });
    if (item) {
      item.quantity += quantity || 1;
      await item.save();
    } else {
      item = new Cart({ userId, productId, quantity: quantity || 1 });
      await item.save();
    }
    res.status(201).json({ message: "Product added to cart", item });
  } catch (error) {
    console.error("Cart Add Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Get cart
app.get("/cart/:userId", async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.params.userId }).populate("productId");
    res.json(cartItems);
  } catch (error) {
    console.error("Fetch Cart Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Update cart quantity
app.put("/cart/update", async (req, res) => {
  const { userId, productId, quantity } = req.body;
  try {
    const item = await Cart.findOne({ userId, productId });
    if (!item) return res.status(404).json({ message: "Cart item not found" });
    item.quantity = quantity;
    await item.save();
    res.json({ message: "Quantity updated", item });
  } catch (error) {
    console.error("Update Cart Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Remove cart item
app.delete("/cart/remove", async (req, res) => {
  const { userId, productId } = req.body;
  try {
    await Cart.findOneAndDelete({ userId, productId });
    res.json({ message: "Item removed from cart" });
  } catch (error) {
    console.error("Remove Cart Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// ====== ORDER ROUTES ======

// Checkout: create order from cart
app.post("/orders/checkout", async (req, res) => {
  const { userId, location, phoneNumber } = req.body;
  try {
    const cartItems = await Cart.find({ userId }).populate("productId");
    if (cartItems.length === 0) return res.status(400).json({ message: "Cart is empty" });

    const items = cartItems.map((item) => ({ productId: item.productId._id, quantity: item.quantity }));
    const totalAmount = cartItems.reduce((sum, item) => sum + item.productId.price * item.quantity, 0);

    const order = new Order({ userId, items, location, phoneNumber, totalAmount });
    await order.save();
    await Cart.deleteMany({ userId }); // Clear cart

    res.status(201).json({ message: "Order placed successfully", order });
  } catch (error) {
    console.error("Checkout Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Get orders by user
app.get("/orders/user/:userId", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId }).populate("items.productId");
    res.json(orders);
  } catch (error) {
    console.error("Fetch User Orders Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// ====== RIDER ROUTES ======

// Get all orders
app.get("/rider/orders", async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("userId", "fullName phoneNumber city location")
      .populate("items.productId", "name price category image");
    res.json(orders);
  } catch (error) {
    console.error("Rider Fetch Orders Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Update order status
app.put("/rider/orders/:orderId/status", async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body; // pending, delivered, canceled

  if (!["pending", "delivered", "canceled"].includes(status))
    return res.status(400).json({ message: "Invalid status value" });

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.status = status;
    await order.save();
    res.json({ message: "Order status updated", order });
  } catch (error) {
    console.error("Update Order Status Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// ====== TEST ROUTE ======
app.get("/", (req, res) => res.send("Server is running!"));

// ====== START SERVER ======
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
