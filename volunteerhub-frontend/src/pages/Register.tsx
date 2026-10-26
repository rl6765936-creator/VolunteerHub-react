import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import useRegister from "../hooks/useRegister";
import type { RegisterRequest } from "../types/auth";

const schema = yup.object({
  name: yup.string().trim().min(2, "Minimum 2 characters").max(80, "Maximum 80 characters").required("Name is required"),
  email: yup.string().email("Invalid email").required("Email is required"),
  password: yup.string().min(8, "Minimum 8 characters").max(128, "Maximum 128 characters").required("Password is required"),
});

const Register = () => {
  const { mutate, isPending, isError } = useRegister();

  const {register,handleSubmit,formState: { errors },} = useForm<RegisterRequest>({
    resolver: yupResolver(schema),
  });

  return (
    <main>
      <h1>Create an account</h1>

      <form onSubmit={handleSubmit((data) => mutate(data))}>
        <label htmlFor="name">Name</label>
        <input id="name" {...register("name")} />
        <p>{errors.name?.message}</p>

        <label htmlFor="email">Email</label>
        <input id="email" type="email" {...register("email")} />
        <p>{errors.email?.message}</p>

        <label htmlFor="password">Password</label>
        <input id="password" type="password" {...register("password")} />
        <p>{errors.password?.message}</p>

        {isError && <p role="alert">Registration failed. Please try again.</p>}

        <button type="submit" disabled={isPending}>
          {isPending ? "Creating account..." : "Register"}
        </button>
      </form>
    </main>
  );
};

export default Register;