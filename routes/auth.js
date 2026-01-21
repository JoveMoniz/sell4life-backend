/**
 * REGISTER (with auto-login)
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, msg: "Missing fields" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ ok: false, msg: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashedPassword
    });

    await user.save();

    // 🔑 ISSUE TOKEN (this was missing)
    const token = jwt.sign(
      { id: user._id, email: user.email },
      SECRET,
      { expiresIn: "3d" }
    );

    res.status(201).json({
      ok: true,
      token,
      user: {
        id: user._id,
        email: user.email
      }
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});
