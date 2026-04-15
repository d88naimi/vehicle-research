import type { GetServerSideProps } from "next";

// Service Advisor lives at / (the home page).
// This keeps any old bookmarks or links working.
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/",
      permanent: true,
    },
  };
};

export default function ServiceAdvisorRedirect() {
  return null;
}
