const port = 4000;
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const { type } = require("os");
const bcrypt = require("bcrypt");
const cloudinary = require('cloudinary').v2;


require('dotenv').config();

cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(express.json());
app.use(cors({
    origin: ['https://jims-touch.onrender.com', 'http://localhost:5174', "https://jims-touch-admin.onrender.com"]
}));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'upload/images');
if (!fs.existsSync(uploadDir)) {
    console.log("directory does not exist")
    fs.mkdirSync(uploadDir, { recursive: true });
}


function getPublicIdFromUrl(url) {
    try {
      // Cloudinary URLs typically follow this pattern:
      // https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/public_id.ext
      
      // Break the URL at '/upload/'
      const parts = url.split('/upload/');
      if (parts.length < 2) return null;
      
      // Get everything after '/upload/' and remove any version number (v1234567890/)
      let path = parts[1];
      path = path.replace(/v\d+\//, '');
      
      // Remove file extension
      const publicId = path.substring(0, path.lastIndexOf('.'));
      
      return publicId;
    } catch (error) {
      console.error("Error extracting public_id from URL:", error);
      return null;
    }
  }

// database connection with mongodb
mongoose.connect("mongodb+srv://martinsolumi:Tommax.24@cluster0.xsgbm.mongodb.net/e-commerce", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log("Connected to MongoDB");
}).catch((error) => {
    console.error("Error connecting to MongoDB:", error);
});

// API Creation
app.get("/", (req, res) => {
    res.send("Express App is Running");
});

// Image Storage Engine
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage: storage });

// Creating Upload endpoint images 
app.use('/images', express.static(uploadDir)); // Changed '/image' to '/images'

app.post("/upload", upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: 0,
            message: "No file uploaded"
        });
    }
    let productDetails;
    try {
        productDetails = JSON.parse(req.body.product);
    } catch (error) {
        return res.status(400).json({
            success: 0,
            message: "Invalid product details. Ensure JSON properties are double-quoted."
        });
    }
    const imageUrl = `${req.protocol}://${req.get('host')}/images/${req.file.filename}`;
    productDetails.image = imageUrl;

    res.json({
        success: 1,
        image_url: imageUrl,
        product: productDetails
    });
}, (error, req, res, next) => {
    console.error("Error uploading product:", error);
    res.status(500).json({ success: 0, message: "Error uploading product", error });
});

// Schema for creating products
const Product = mongoose.model("Product", {
    id: {
        type: Number,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    new_price: {
        type: Number,
        required: true,
    },
    old_price: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    available: {
        type: Boolean,
        default: true,
    },
});

app.post('/addproduct', async (req, res) => {
    let products = await Product.find({});
    let id;
    if (products.length > 0) {
        let last_product = products[products.length - 1];
        id = last_product.id + 1;
    } else {
        id = 1;
    }
    try {
        const product = new Product({
            id: id,
            name: req.body.name,
            image: req.body.image,
            category: req.body.category,
            new_price: req.body.new_price,
            old_price: req.body.old_price,
        });
        console.log(product);
        await product.save();
        console.log("Saved");
        res.json({
            success: true,
            name: req.body.name,
        });
    } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// Create API for deleting products
app.post('/removeproduct', async (req, res) => {
    try {
      // Find the product to get the image URL before deleting
      const product = await Product.findOne({ id: req.body.id });
      
      if (!product) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }
      
      // Extract the image URL from the product
      const imageUrl = product.image;
      
      // Delete the product from the database
      await Product.findOneAndDelete({ id: req.body.id });
      
      // If there's an image URL, delete it from Cloudinary
      if (imageUrl && imageUrl.includes('cloudinary.com')) {
        const publicId = getPublicIdFromUrl(imageUrl);
        
        if (publicId) {
          // Delete the image from Cloudinary
          const cloudinaryResult = await cloudinary.uploader.destroy(publicId);
          console.log("Cloudinary delete result:", cloudinaryResult);
        }
      }
      
      console.log("Product and associated image removed");
      res.json({
        success: true,
        name: product.name
      });
    } catch (error) {
      console.error("Error removing product:", error);
      res.status(500).json({ success: false, error: "Internal Server Error" });
    }
  });

//Creating API for getting all products
app.get('/allproduct', async (req, res) => {
    let products = await Product.find({});
    console.log("All Products Fetched");
    res.send(products);
});

//Shema creating for user model

const Users = mongoose.model('Users', {
    name: {
        type: String,
    },
    email: {
        type: String,
        unique: true,

    },
    password: {
        type: String,

    },
    CartData: {
        type: Object,
    },
    date: {
        type: Date,
        default: Date.now,
    }

});

//Creating endpoint for registering the user
app.post('/signup', async (req, res) => {
    try {
        let check = await Users.findOne({ email: req.body.email });
        if (check) {
            return res.status(400).json({ success: false, errors: "Existing user found with the same email" });
        }
        let cart = {};
        for (let i = 0; i < 300; i++) {
            cart[i] = 0;
        }
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const user = new Users({
            name: req.body.username,
            email: req.body.email,
            password: hashedPassword,
            CartData: cart,
        });

        await user.save();

        const data = {
            user: {
                id: user.id
            }
        };

        const token = jwt.sign(data, 'secret_ecom');
        res.json({ success: true, token });
    } catch (error) {
        console.error("Error during signup:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// creating endpoin for the user login
app.post('/login', async (req, res) => {
    try {
        let user = await Users.findOne({ email: req.body.email });
        if (user) {
            const passCompare = await bcrypt.compare(req.body.password, user.password);
            if (passCompare) {
                const data = {
                    user: {
                        id: user.id
                    }
                };
                const token = jwt.sign(data, 'secret_ecom');
                res.json({ success: true, token });
            } else {
                res.json({ success: false, errors: "Wrong Password" });
            }
        } else {
            res.json({ success: false, errors: "Wrong Email id" });
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// creating endpoint for newCollection data
app.get('/newcollections', async (req, res) => {
    let products = await Product.find({});
    let newcollection = products.slice(-10); // Changed to collect the last 10 products
    console.log("NewCollection Fetched ");
    res.send(newcollection);
});

//creating endpoint for popular data
app.get('/popular', async (req, res) => {
    try {
        let products = await Product.find({ category: "wigs" });
        let popular = products.slice(0, 4);
        console.log("Popular in woman fetched");
        res.json({
            success: true,
            popular: popular
        });
    } catch (error) {
        console.error("Error fetching popular products:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});
// creating middleware to fetch user
const fetchUser = async (req, res, next) => {
    const token = req.header('auth-token'); // Ensure the header name is correct
    if (!token) {
        return res.status(401).send({ error: "Please authenticate using a valid token" });
    }
    try {
        const data = jwt.verify(token, 'secret_ecom');
        req.user = data.user;
        next();
    } catch (error) {
        console.error("Token verification error:", error);
        res.status(401).send({ error: "Please authenticate using a valid token" });
    }
};

// creating adding products to cart
app.post('/addtocart', fetchUser, async (req, res) => {
    try {
        const user = await Users.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        const { productId, quantity } = req.body;
        if (!productId || !quantity) {
            return res.status(400).json({ success: false, error: "Product ID and quantity are required" });
        }

        // Ensure CartData is initialized as an object
        if (!user.CartData) {
            user.CartData = {};
        }

        if (!user.CartData[productId]) {
            user.CartData[productId] = 0;
        }
        user.CartData[productId] += quantity;

        // Mark CartData as modified
        user.markModified('CartData');

        await user.save();

        res.json({ success: true, message: "Product added to cart", cart: user.CartData });
    } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// creating endpoint to get user's cart data
app.get('/cart', fetchUser, async (req, res) => {
    try {
        const user = await Users.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        res.json({ success: true, cart: user.CartData });
    } catch (error) {
        console.error("Error fetching cart data:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// creating endpoint cart


app.listen(port, (error) => {
    if (!error) {
        console.log("Server Running on Port " + port);
    } else {
        console.log("Error : " + error);
    }
});

